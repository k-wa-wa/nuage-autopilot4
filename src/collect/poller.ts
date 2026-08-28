import type { DB } from "../store/db.ts";
import * as cache from "../store/cache.ts";
import * as items from "../store/items.ts";
import * as cursors from "../store/cursors.ts";
import type { RepoConfig } from "../config.ts";
import { DEFAULTS, repoSlug } from "../config.ts";
import type { GitHubClient } from "../github/client.ts";
import { GitHubError, rateLimitState } from "../github/client.ts";
import { poll, issueFingerprint, prFingerprint } from "../github/poll.ts";
import { fetchDetails, linkedPrNumber, headOid } from "../github/detail.ts";
import type { Detail, IssueDetail, PrDetail } from "../github/detail.ts";

/**
 * ① 収集（spec.md §5）。
 *
 * 2 段フェッチ。Phase 1 で fingerprint を取り、変化したものだけ Phase 2 に進む。
 * カーソルは Phase 1 と Phase 2 の両方が成功した後にのみ前進させる。
 */

export interface PollOutcome {
  repo: string;
  /** payload_hash が実際に変わり、Triage を起動すべきアイテム。 */
  changed: Array<{ issueNumber: number }>;
  coldStart: boolean;
  error?: string;
}

export async function pollRepo(
  db: DB,
  gh: GitHubClient,
  r: RepoConfig,
  botLogin: string,
): Promise<PollOutcome> {
  const repo = repoSlug(r);
  const cursorName = cursors.syncCursorName(repo);
  const prev = cursors.getCursor(db, cursorName);
  const coldStart = prev === null;
  const since = prev ?? isoDaysAgo(DEFAULTS.coldStartDays);

  let p: Awaited<ReturnType<typeof poll>>;
  try {
    p = await poll(gh, r.owner, r.name, since);
  } catch (e) {
    if (e instanceof GitHubError) return { repo, changed: [], coldStart, error: e.kind };
    throw e;
  }
  rateLimitState.graphqlRemaining = p.remaining;
  if (p.limit) rateLimitState.graphqlLimit = p.limit;
  if (p.resetAt) rateLimitState.graphqlResetAt = p.resetAt;

  // Phase 1: fingerprint を比べ、変化したものだけ Phase 2 の対象にする。
  const targets = new Map<string, { kind: "issue" | "pull_request"; number: number }>();

  for (const i of p.result.issues) {
    const fp = issueFingerprint(i);
    if (cache.getFingerprint(db, repo, "issue", i.number) === fp) continue;
    // Done のアイテムは Phase 2 に進めない。例外は CLOSED -> OPEN（Phase 1 の state だけで判定できる）。
    const it = items.getItem(db, repo, i.number);
    if (it?.state === "Done" && i.state !== "OPEN") {
      cache.upsertFingerprint(db, repo, "issue", i.number, i.id, fp, i.updatedAt);
      continue;
    }
    cache.upsertFingerprint(db, repo, "issue", i.number, i.id, fp, i.updatedAt);
    targets.set(i.id, { kind: "issue", number: i.number });
  }

  const openPrNumbers = new Set(p.result.prs.map((x) => x.number));
  for (const pr of p.result.prs) {
    const fp = prFingerprint(pr);
    if (cache.getFingerprint(db, repo, "pull_request", pr.number) === fp) continue;
    cache.upsertFingerprint(db, repo, "pull_request", pr.number, pr.id, fp, pr.updatedAt);
    targets.set(pr.id, { kind: "pull_request", number: pr.number });
  }

  // OPEN 一覧から消えた PR。マージ/クローズは「変化した」ではなく「存在しない」になるため、
  // 差分検知だけに任せると Working (CI 待ち) のまま永久に取り残される。
  // 全ページ取得完了後にのみ判定する（未取得の OPEN PR を「消えた」と誤判定しないため）。
  if (!p.result.prsHasNext) {
    for (const it of items.trackedPrs(db, repo)) {
      if (openPrNumbers.has(it.pr_number)) continue;
      const row = cache.getCached(db, repo, "pull_request", it.pr_number);
      if (row?.node_id) targets.set(row.node_id, { kind: "pull_request", number: it.pr_number });
    }
  }

  if (targets.size === 0) {
    cursors.setCursor(db, cursorName, overlap(p.date));
    return { repo, changed: [], coldStart };
  }

  // Phase 2
  let details: Detail[];
  try {
    details = await fetchDetails(gh, [...targets.keys()]);
  } catch (e) {
    // Phase 2 が失敗したらカーソルを進めない。次周期で再取得する。
    if (e instanceof GitHubError) return { repo, changed: [], coldStart, error: e.kind };
    throw e;
  }

  const changed: Array<{ issueNumber: number }> = [];
  for (const d of details) {
    const kind = d.__typename === "Issue" ? "issue" : "pull_request";
    const moved = cache.upsertDetail(db, repo, kind, d.number, d.id, d, d.updatedAt);
    if (d.__typename === "Issue") {
      syncIssueItem(db, repo, d, botLogin, coldStart);
      if (moved || coldStart) changed.push({ issueNumber: d.number });
    } else {
      syncPrItem(db, repo, d);
      const owner = items.trackedPrs(db, repo).find((x) => x.pr_number === d.number);
      if (owner && moved) changed.push({ issueNumber: owner.issue_number });
    }
  }

  cursors.setCursor(db, cursorName, overlap(p.date));
  // コールドスタートは「シードのみ」。Triage を起動せず job_queue にも一切 INSERT しない。
  return { repo, changed: coldStart ? [] : dedupe(changed), coldStart };
}

/**
 * items 行の作成と、Poller が持つ列の更新（方針9: 列ごとに書き手は 1 つ）。
 * state / display_hint は既存行では触らない。
 */
function syncIssueItem(db: DB, repo: string, d: IssueDetail, botLogin: string, coldStart: boolean): void {
  const existing = items.getItem(db, repo, d.number);
  const parentRepo = d.parent?.repository.nameWithOwner ?? "";
  const parentNum = d.parent?.number ?? 0;

  if (!existing) {
    // bot が起票し parent を持つ Issue は refine 済みの子。再度 refine を走らせない。
    const isBotChild = d.author?.login === botLogin && !!d.parent;
    const prNumber = resolveLinkedPr(db, repo, d.number, d);
    items.createItem(db, {
      repo,
      issue_number: d.number,
      title: d.title,
      state: d.state === "CLOSED" ? "Done" : "ActionRequired",
      display_hint: d.state === "CLOSED" ? "" : isBotChild ? "親 Issue の承認待ち" : "未着手",
      // コールドスタートと bot の子は refine 投入の対象外にする。
      triaged: coldStart || isBotChild ? 1 : 0,
      last_event_at: latestEventAt(d),
      last_event_id: latestEventId(d),
      pr_number: prNumber,
      parent_repo: parentRepo,
      parent_issue_number: parentNum,
      // ci_since は NULL のまま。Autopilot が作った PR でなければ CI 判定の対象にしない。
      ci_since: null,
    });
    return;
  }

  items.refreshFromGitHub(db, existing, {
    title: d.title,
    parent_repo: parentRepo,
    parent_issue_number: parentNum,
    sub_issues_total: d.subIssuesSummary.total,
    sub_issues_completed: d.subIssuesSummary.completed,
    ...(existing.pr_number === 0 ? { pr_number: resolveLinkedPr(db, repo, d.number, d) } : {}),
  });
}

/**
 * linkedPrNumber() が返す PR は、複数の Issue から close されうる
 * （例: 親 Issue と子 Issue を同じ PR が close する）。
 * idx_items_pr は 1 PR につき 1 item までしか許さないため、
 * 既に他の Issue がその PR 番号を持っているなら、この Issue には紐付けない。
 */
function resolveLinkedPr(db: DB, repo: string, issueNumber: number, d: IssueDetail): number {
  const pr = linkedPrNumber(d);
  if (!pr) return 0;
  const owner = items.findByPrNumber(db, repo, pr);
  return !owner || owner.issue_number === issueNumber ? pr : 0;
}

function syncPrItem(db: DB, repo: string, d: PrDetail): void {
  const owner = items.trackedPrs(db, repo).find((x) => x.pr_number === d.number);
  if (!owner) return;
  items.refreshFromGitHub(db, owner, {
    branch: d.headRefName,
    head_sha: headOid(d) || d.headRefOid,
  });
}

function latestEventAt(d: IssueDetail): string {
  return d.comments.nodes.reduce((m, c) => (c.createdAt > m ? c.createdAt : m), "");
}
function latestEventId(d: IssueDetail): number {
  return d.comments.nodes.reduce((m, c) => Math.max(m, c.databaseId ?? 0), 0);
}

function dedupe(xs: Array<{ issueNumber: number }>): Array<{ issueNumber: number }> {
  const seen = new Set<number>();
  return xs.filter((x) => (seen.has(x.issueNumber) ? false : (seen.add(x.issueNumber), true)));
}

/** クロックドリフト対策。サーバ時刻から 5 分引く。重複は fingerprint / payload_hash で無害化される。 */
function overlap(serverDate: string): string {
  return new Date(Date.parse(serverDate) - DEFAULTS.cursorOverlapMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

