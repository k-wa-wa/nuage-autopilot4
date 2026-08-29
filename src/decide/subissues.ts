import type { IssueDetail, SubIssue } from "../github/detail.ts";
import type { DB } from "../store/db.ts";
import * as items from "../store/items.ts";
import * as jobs from "../store/jobs.ts";
import type { Item } from "../types.ts";
import { subProgress } from "../types.ts";

/**
 * 親子 Issue（spec.md §9）。
 *
 * subIssuesSummary.completed は「CLOSED な子の件数」であり、却下（NOT_PLANNED）も数える。
 * percentCompleted == 100 だけを見て「全子タスク完了」と報告すると、
 * 実際には却下されただけの子を成功として集計してしまう。
 */

export interface ChildRef {
  repo: string;
  number: number;
  closed: boolean;
  rejected: boolean;
}

export function children(d: IssueDetail): ChildRef[] {
  return d.subIssues.nodes.map((c: SubIssue) => ({
    repo: c.repository.nameWithOwner,
    number: c.number,
    closed: c.state === "CLOSED",
    rejected: c.stateReason === "NOT_PLANNED",
  }));
}

/**
 * 親の承認を子へ展開する。
 * 対象は監視対象リポジトリの子だけ。監視対象外の子にジョブを積むと、
 * items 行が無いまま未登録リポジトリを clone して走ることになる。
 */
export function fanOut(
  db: DB,
  parent: Item,
  d: IssueDetail,
  monitored: Set<string>,
  commentId: number,
  context: string,
): number {
  let n = 0;
  for (const c of children(d)) {
    if (c.closed) continue;
    if (!monitored.has(c.repo)) continue;
    const id = jobs.enqueueJob(db, {
      repo: c.repo,
      issue_number: c.number,
      job_type: "implement",
      job_context: context,
      trigger_key: `fanout:${parent.repo}#${parent.issue_number}:${commentId}`,
    });
    if (id !== null) {
      n++;
      items.withRetry(db, c.repo, c.number, (child) =>
        items.transitionItem(db, child, { state: "Queued", hint: "着手待ち" }),
      );
    }
  }
  items.withRetry(db, parent.repo, parent.issue_number, (p) =>
    items.transitionItem(db, p, {
      state: "Working",
      hint: subProgress(p.sub_issues_completed, p.sub_issues_total),
    }),
  );
  return n;
}

export type AggregateResult =
  | { kind: "in_progress"; done: number; total: number }
  | { kind: "complete"; completed: number[]; rejected: number[] }
  | { kind: "all_rejected"; rejected: number[] }
  | { kind: "unknown"; reason: string };

/**
 * 完了集約。
 * hasNextPage のときは stateReason の内訳判定を行ってはならない（取得できていない子がある）。
 */
export function aggregate(item: Item, d: IssueDetail): AggregateResult {
  const total = item.sub_issues_total;
  const done = item.sub_issues_completed;

  if (total === 0) return { kind: "unknown", reason: "no children" };
  if (done < total) return { kind: "in_progress", done, total };

  if (d.subIssues.pageInfo.hasNextPage) {
    return { kind: "unknown", reason: "sub-issues paginated; cannot break down stateReason" };
  }

  const cs = children(d);
  const completed = cs.filter((c) => c.closed && !c.rejected).map((c) => c.number);
  const rejected = cs.filter((c) => c.rejected).map((c) => c.number);

  if (completed.length === 0) return { kind: "all_rejected", rejected };
  return { kind: "complete", completed, rejected };
}

/** 完了報告では却下を区別する。人間が「本当に終わったのか」を判断できるようにする。 */
export function completionComment(r: Extract<AggregateResult, { kind: "complete" }>): string {
  const lines = ["すべての子タスクがクローズされました。"];
  if (r.completed.length)
    lines.push(`- 完了 (COMPLETED): ${r.completed.map((n) => `#${n}`).join(", ")}`);
  if (r.rejected.length)
    lines.push(`- 却下 (NOT_PLANNED): ${r.rejected.map((n) => `#${n}`).join(", ")}`);
  lines.push("", "親 Issue をクローズしてよければ OK と返信してください。");
  return lines.join("\n");
}
