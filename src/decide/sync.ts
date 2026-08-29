import type { IssueDetail, PrDetail } from "../github/detail.ts";
import * as cache from "../store/cache.ts";
import type { DB } from "../store/db.ts";
import * as items from "../store/items.ts";
import * as jobs from "../store/jobs.ts";
import type { Item, JobType } from "../types.ts";

/**
 * GitHub 実態からの強制同期（spec.md §3）。
 *
 * 上から順に評価し、最初に該当した行で確定する（first-match）。
 * 終端（Done / 取り下げ）の判定は進行中を表す行より必ず上に置く。
 * LLM の判定よりここが常に優先される。
 */

export interface SyncInput {
  item: Item;
  issue: IssueDetail;
  pr: PrDetail | null;
  allowlist: string[];
  /** 前回キャッシュの Issue state。reopen 判定に使う。 */
  prevIssueState: "OPEN" | "CLOSED" | null;
}

export interface SyncResult {
  handled: boolean;
  /** 積んだジョブ（あれば）。 */
  enqueued?: { job_type: JobType; trigger_key: string };
  rule?: string;
}

type Rule = {
  name: string;
  when: (i: SyncInput) => boolean;
  run: (db: DB, i: SyncInput) => SyncResult;
};

const RULES: Rule[] = [
  {
    // 1. Issue が CLOSED
    name: "issue-closed",
    when: ({ issue }) => issue.state === "CLOSED",
    run: (db, i) => {
      finishAsDone(db, i);
      return { handled: true, rule: "issue-closed" };
    },
  },
  {
    // 2. PR が MERGED かつ Issue も CLOSED（1 で拾われるが、明示のため残す）
    name: "pr-merged-issue-closed",
    when: ({ pr, issue }) => !!pr?.merged && issue.state === "CLOSED",
    run: (db, i) => {
      finishAsDone(db, i);
      return { handled: true, rule: "pr-merged-issue-closed" };
    },
  },
  {
    // 3. PR が MERGED だが Issue は OPEN のまま
    name: "pr-merged-issue-open",
    when: ({ pr, issue }) => !!pr?.merged && issue.state === "OPEN",
    run: (db, i) => {
      items.transitionItem(db, i.item, { state: "ActionRequired", hint: "Issue クローズ確認待ち" });
      return { handled: true, rule: "pr-merged-issue-open" };
    },
  },
  {
    // 4. PR が未マージのまま CLOSED。紐付けをリセットして人間に返す。
    name: "pr-closed-unmerged",
    when: ({ pr }) => !!pr && pr.state === "CLOSED" && !pr.merged,
    run: (db, i) => {
      jobs.cancelJobsFor(db, i.item.repo, i.item.issue_number);
      items.transitionItem(db, i.item, {
        state: "ActionRequired",
        hint: "取り下げ確認待ち",
        clearPr: true,
      });
      return { handled: true, rule: "pr-closed-unmerged" };
    },
  },
  {
    // 5. reopen。retry_count / blocked_from をリセットして refine を積み直す。
    name: "reopened",
    when: ({ issue, prevIssueState }) => prevIssueState === "CLOSED" && issue.state === "OPEN",
    run: (db, i) => {
      const key = `reopen:${i.issue.updatedAt}`;
      const id = jobs.enqueueJob(db, {
        repo: i.item.repo,
        issue_number: i.item.issue_number,
        job_type: "refine",
        job_context: reopenContext(i.issue),
        trigger_key: key,
      });
      items.transitionItem(db, i.item, {
        state: id ? "Queued" : "ActionRequired",
        hint: id ? "着手待ち" : "未着手",
        retryCount: 0,
        blockedFrom: undefined,
        triaged: true,
        reviveFromDone: true,
      });
      return {
        handled: true,
        rule: "reopened",
        ...(id ? { enqueued: { job_type: "refine" as const, trigger_key: key } } : {}),
      };
    },
  },
  {
    // 6. 未 Triage の新規起票。allowlist 内の人間が立てた Issue だけを refine に載せる。
    name: "new-issue",
    when: ({ item, issue, pr, allowlist }) =>
      item.triaged === 0 &&
      issue.state === "OPEN" &&
      !pr &&
      item.pr_number === 0 &&
      !issue.parent &&
      !!issue.author &&
      allowlist.includes(issue.author.login),
    run: (db, i) => {
      const key = `open:${i.item.issue_number}`;
      const id = jobs.enqueueJob(db, {
        repo: i.item.repo,
        issue_number: i.item.issue_number,
        job_type: "refine",
        job_context: newIssueContext(i.issue),
        trigger_key: key,
      });
      items.transitionItem(db, i.item, {
        state: id ? "Queued" : "ActionRequired",
        hint: id ? "着手待ち" : "未着手",
        triaged: true,
      });
      return {
        handled: true,
        rule: "new-issue",
        ...(id ? { enqueued: { job_type: "refine" as const, trigger_key: key } } : {}),
      };
    },
  },
];

/** 該当すれば機械的に確定させる。該当しなければ handled: false で Triage へ流す。 */
export function forcedSync(db: DB, input: SyncInput): SyncResult {
  for (const r of RULES) {
    if (r.when(input)) return r.run(db, input);
  }
  return { handled: false };
}

/**
 * Done 確定の共通処理。
 * - 当該アイテムの未完了ジョブを canceled にする（実行中ジョブが Done を巻き戻さないように）
 * - 親があれば recheck_needed を立て、親の fingerprint をクリアして Phase 2 に載せる
 *   （Tick はローカル DB しか読まないため、再取得しないと古い集計を読む）
 */
function finishAsDone(db: DB, i: SyncInput): void {
  jobs.cancelJobsFor(db, i.item.repo, i.item.issue_number);
  items.transitionItem(db, i.item, { state: "Done", hint: "" });

  const pRepo = i.item.parent_repo || i.issue.parent?.repository.nameWithOwner || "";
  const pNum = i.item.parent_issue_number || i.issue.parent?.number || 0;
  if (pRepo && pNum) {
    items.markRecheck(db, pRepo, pNum);
    cache.clearFingerprint(db, pRepo, pNum);
  }
}

function newIssueContext(issue: IssueDetail): string {
  return [
    `Issue #${issue.number}: ${issue.title}`,
    "",
    "<untrusted_content>",
    issue.body ?? "",
    "</untrusted_content>",
  ].join("\n");
}

function reopenContext(issue: IssueDetail): string {
  return [
    `Issue #${issue.number} が reopen された。`,
    "既存の仕様本文を削除せず、reopen 理由に応じた差分を追記すること。",
    "",
    "<untrusted_content>",
    issue.body ?? "",
    issue.comments.nodes.at(-1)?.body ?? "",
    "</untrusted_content>",
  ].join("\n");
}
