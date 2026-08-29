import type { DB } from "../store/db.ts";
import * as items from "../store/items.ts";
import * as jobs from "../store/jobs.ts";
import * as cache from "../store/cache.ts";
import * as runsStore from "../store/runs.ts";
import type { Config } from "../config.ts";
import { DEFAULTS } from "../config.ts";
import type { GitHubClient } from "../github/client.ts";
import type { IssueDetail, PrDetail } from "../github/detail.ts";
import { forcedSync } from "./sync.ts";
import { decideCiAction } from "./ci.ts";
import { fastPassApplies } from "./fastpass.ts";
import { runTriage } from "./triage.ts";
import { aggregate, completionComment, fanOut } from "./subissues.ts";
import { subProgress } from "../types.ts";
import type { Item } from "../types.ts";

/**
 * ② 判定（spec.md §6）。
 *
 * LLM を呼ぶのは最下段の 1 経路だけ。
 * 無変更・自分の投稿・定型承認・実行中アイテムはすべてその手前で落とす。
 */

export interface DispatchDeps {
  db: DB;
  cfg: Config;
  gh: GitHubClient;
  botLogin: string;
  monitored: Set<string>;
  log: (level: "info" | "warn", msg: string) => void;
}

export interface NewEvent {
  kind: "comment" | "review" | "review_comment";
  databaseId: number;
  author: string;
  body: string;
  at: string;
}

export async function dispatch(d: DispatchDeps, repo: string, issueNumber: number): Promise<void> {
  const it = items.getItem(d.db, repo, issueNumber);
  if (!it) return;

  const issue = cache.payload<IssueDetail>(d.db, repo, "issue", issueNumber);
  if (!issue) return;
  const pr = it.pr_number > 0
    ? cache.payload<PrDetail>(d.db, repo, "pull_request", it.pr_number)
    : null;

  // 1. GitHub 実態による強制同期。該当すれば LLM を呼ばずに確定。
  const prevState = it.state === "Done" ? "CLOSED" : "OPEN";
  const sync = forcedSync(d.db, {
    item: it, issue, pr, allowlist: d.cfg.allowlist, prevIssueState: prevState,
  });
  if (sync.handled) {
    d.log("info", `${repo}#${issueNumber}: sync=${sync.rule}`);
    return;
  }

  // 2. 所有権。実行中・待機中のジョブがある間は状態を書き換えず、保留の印だけ立てる。
  if (jobs.hasActiveJob(d.db, repo, issueNumber)) {
    items.markRecheck(d.db, repo, issueNumber);
    return;
  }

  const fresh = items.getItem(d.db, repo, issueNumber)!;

  // 3. 新規イベントの抽出。0 件なら LLM を呼ばず機械的規則だけで処理する。
  const events = newEvents(fresh, issue, pr).filter((e) => e.author !== d.botLogin);
  if (events.length === 0) {
    await mechanicalOnly(d, fresh, issue, pr);
    return;
  }

  // 4. 発信者フィルタ。allowlist 外の発言はパイプラインを駆動しない（追跡はする）。
  const driving = events.filter((e) => d.cfg.allowlist.includes(e.author));
  if (driving.length === 0) {
    // allowlist 外の発言は駆動しないが、処理済みとして読み飛ばす。
    advanceCursor(d.db, fresh, events);
    return;
  }

  const last = driving[driving.length - 1]!;

  // 5. FastPass。最頻出の「OK」を LLM 消費 0 で通す。
  if (fastPassApplies(fresh, last.body)) {
    enqueue(d, fresh, "implement", last.body, `comment:${last.databaseId}`, events);
    return;
  }

  // 5b. 子を持つ親への承認はファンアウト。親自身の実装ではない。
  if (fresh.sub_issues_total > 0 && isApprovalLike(last.body)) {
    d.db.transaction(() => {
      const n = fanOut(d.db, fresh, issue, d.monitored, last.databaseId, last.body);
      advanceCursor(d.db, fresh, events);
      d.log("info", `${repo}#${issueNumber}: fanout ${n} children`);
    })();
    return;
  }

  // 6. Triage Agent（LLM）。
  const result = await runTriage(d.cfg, {
    item: fresh, issue, pr, lastRun: runsStore.lastRun(d.db, repo, issueNumber),
    newEvents: driving.map((e) => ({ kind: e.kind, author: e.author, body: e.body, at: e.at })),
  });

  if (result.kind === "error") {
    // 一過性の可能性が高い。カーソルを進めず（＝指示を落とさず）recheck を立てて次周期に再試行する。
    const n = fresh.triage_fail_count + 1;
    d.log("warn", `${repo}#${issueNumber}: triage error (${n}/${DEFAULTS.triageFailLimit}) ${result.reason}`);
    items.withRetry(d.db, repo, issueNumber, (cur) =>
      n >= DEFAULTS.triageFailLimit
        ? items.transitionItem(d.db, cur, {
            state: "ActionRequired", hint: "Triage 失敗（要判断）", triageFailCount: n,
          })
        : items.transitionItem(d.db, cur, {
            state: cur.state, hint: cur.display_hint, triageFailCount: n, recheckNeeded: true,
          }),
    );
    return;
  }

  if (result.kind === "invalid") {
    // 同じ入力を再投入しても同じ不正出力が返る蓋然性が高い。進めないと毎周期 LLM を呼び続ける。
    advanceCursor(d.db, fresh, events);
    const n = fresh.triage_fail_count + 1;
    d.log("warn", `${repo}#${issueNumber}: triage invalid (${n}) ${result.reason}`);
    items.withRetry(d.db, repo, issueNumber, (cur) =>
      n >= DEFAULTS.triageFailLimit
        ? items.transitionItem(d.db, cur, {
            state: "ActionRequired", hint: "Triage 失敗（要判断）", triageFailCount: n,
          })
        : items.transitionItem(d.db, cur, {
            state: cur.state, hint: cur.display_hint, triageFailCount: n,
          }),
    );
    return;
  }

  const o = result.output;

  // 助言待ちからの復帰に限り blocked_from を優先する。
  // それ以外（マージ待ちの PR への修正指示など）で優先すると、指示が無視される。
  const job =
    fresh.display_hint === "助言待ち" && fresh.blocked_from && o.next_job !== "none"
      ? fresh.blocked_from
      : o.next_job;
  if (job !== o.next_job) {
    d.log("warn", `${repo}#${issueNumber}: triage said ${o.next_job}, blocked_from=${job} wins`);
  }

  if (job === "none") {
    d.db.transaction(() => {
      items.withRetry(d.db, repo, issueNumber, (cur) =>
        items.transitionItem(d.db, cur, { state: o.state, hint: o.display_hint, triageFailCount: 0 }),
      );
      advanceCursor(d.db, fresh, events);
    })();
    return;
  }
  enqueue(d, fresh, job, o.job_context, `comment:${last.databaseId}`, events);
}

/** 新規イベントが無いときの経路。CI 判定と親の完了集約だけを機械的に行う。 */
async function mechanicalOnly(
  d: DispatchDeps, it: Item, issue: IssueDetail, pr: PrDetail | null,
): Promise<void> {
  if (it.sub_issues_total > 0) {
    await aggregateParent(d, it, issue);
    return;
  }

  const action = decideCiAction(it, pr);
  switch (action.kind) {
    case "skip":
      return;
    case "wait":
      items.withRetry(d.db, it.repo, it.issue_number, (cur) =>
        items.transitionItem(d.db, cur, { state: "Working", hint: action.hint }),
      );
      return;
    case "evaluate":
      enqueue(d, it, "evaluate", `CI が通過した。PR #${it.pr_number} を評価する。`, action.triggerKey);
      return;
    case "reimplement": {
      const ctx = `CI が失敗した（${action.reason}）。ログを確認して修正すること。`;
      const id = jobs.enqueueJob(d.db, {
        repo: it.repo, issue_number: it.issue_number, job_type: "implement",
        job_context: ctx, trigger_key: action.triggerKey,
      });
      items.withRetry(d.db, it.repo, it.issue_number, (cur) =>
        items.transitionItem(d.db, cur, {
          state: id ? "Queued" : "Working",
          hint: id ? "着手待ち" : "CI 待ち",
          retryCount: id ? cur.retry_count + 1 : cur.retry_count,
        }),
      );
      return;
    }
    case "escalate":
      items.withRetry(d.db, it.repo, it.issue_number, (cur) =>
        items.transitionItem(d.db, cur, { state: "ActionRequired", hint: action.hint }),
      );
      return;
  }
}

async function aggregateParent(d: DispatchDeps, it: Item, issue: IssueDetail): Promise<void> {
  const r = aggregate(it, issue);
  if (r.kind === "unknown") return;

  if (r.kind === "in_progress") {
    items.withRetry(d.db, it.repo, it.issue_number, (cur) =>
      items.transitionItem(d.db, cur, { state: "Working", hint: subProgress(r.done, r.total) }),
    );
    return;
  }

  if (r.kind === "all_rejected") {
    items.withRetry(d.db, it.repo, it.issue_number, (cur) =>
      items.transitionItem(d.db, cur, { state: "ActionRequired", hint: "完了確認待ち" }),
    );
    await comment(d, it.repo, it.issue_number,
      `すべての子タスクが却下 (NOT_PLANNED) されました: ${r.rejected.map((n) => `#${n}`).join(", ")}\n\n親 Issue の扱いを判断してください。`);
    return;
  }

  items.withRetry(d.db, it.repo, it.issue_number, (cur) =>
    items.transitionItem(d.db, cur, { state: "ActionRequired", hint: "完了確認待ち" }),
  );
  await comment(d, it.repo, it.issue_number, completionComment(r));
}

/**
 * ジョブ INSERT とカーソル前進は同一トランザクションで行う。
 * 先に進めるとクラッシュ時に指示を取りこぼし、後に進めると二重投入を招く。
 */
function enqueue(
  d: DispatchDeps, it: Item, job: "refine" | "implement" | "evaluate", ctx: string, key: string,
  events?: NewEvent[],
): void {
  d.db.transaction(() => {
    const id = jobs.enqueueJob(d.db, {
      repo: it.repo, issue_number: it.issue_number, job_type: job, job_context: ctx, trigger_key: key,
    });
    if (events) advanceCursor(d.db, it, events);
    if (id === null) return;
    items.withRetry(d.db, it.repo, it.issue_number, (cur) =>
      items.transitionItem(d.db, cur, { state: "Queued", hint: "着手待ち", retryCount: 0 }),
    );
    d.log("info", `${it.repo}#${it.issue_number}: enqueue ${job} (${key})`);
  })();
}

/**
 * 新規イベント = 前回処理以降に増えた Issue コメント / PR レビュー / インラインコメント。
 * 時刻を主キー、databaseId を同時刻の tie-break にする
 * （databaseId の採番空間はリソースごとに別なので単純な大小比較で横断できない）。
 */
export function newEvents(it: Item, issue: IssueDetail, pr: PrDetail | null): NewEvent[] {
  const out: NewEvent[] = [];
  const push = (kind: NewEvent["kind"], id: number, author: string | undefined, body: string, at: string) => {
    if (!at) return;
    if (at < it.last_event_at) return;
    if (at === it.last_event_at && id <= it.last_event_id) return;
    out.push({ kind, databaseId: id, author: author ?? "", body: body ?? "", at });
  };

  for (const c of issue.comments.nodes) {
    push("comment", c.databaseId, c.author?.login, c.body, c.createdAt);
  }
  for (const c of pr?.comments.nodes ?? []) {
    push("comment", c.databaseId, c.author?.login, c.body, c.createdAt);
  }
  for (const r of pr?.reviews.nodes ?? []) {
    push("review", r.databaseId, r.author?.login, r.body, r.submittedAt);
  }
  // Files changed のインラインコメント。単発返信は body が空の COMMENTED レビューを作るため、
  // レビューだけを見ると「新しいイベントはあるが本文が無い」状態になる。
  for (const t of pr?.reviewThreads.nodes ?? []) {
    for (const c of t.comments.nodes) {
      const loc = c.path ? `[${c.path}${c.line ? `:${c.line}` : ""}] ` : "";
      push("review_comment", c.databaseId, c.author?.login, `${loc}${c.body}`.trim(), c.createdAt);
    }
  }

  out.sort((a, b) => (a.at === b.at ? a.databaseId - b.databaseId : a.at.localeCompare(b.at)));
  return out;
}

function advanceCursor(db: DB, it: Item, events: NewEvent[]): void {
  const last = events[events.length - 1];
  if (!last) return;
  db.query(
    "UPDATE items SET last_event_at = ?, last_event_id = ?, version = version + 1, updated_at = ? WHERE repo=? AND issue_number=?",
  ).run(last.at, last.databaseId, new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), it.repo, it.issue_number);
}

function isApprovalLike(body: string): boolean {
  return /^(ok|了解|承認|進めて|お願いします|やって|go)[。！!.]*$/iu.test(body.trim());
}

async function comment(d: DispatchDeps, repo: string, issue: number, body: string): Promise<void> {
  await d.gh.rest(`/repos/${repo}/issues/${issue}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

