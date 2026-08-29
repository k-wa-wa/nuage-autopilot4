import type { GitHubClient } from "../src/github/client.ts";
import type { IssueDetail, PrDetail } from "../src/github/detail.ts";
import type { DB } from "../src/store/db.ts";
import { openDb } from "../src/store/db.ts";
import * as items from "../src/store/items.ts";
import type { Item } from "../src/types.ts";

export function memDb(): DB {
  return openDb(":memory:");
}

export function seedItem(
  db: DB,
  over: Partial<Item> & { repo: string; issue_number: number },
): Item {
  items.createItem(db, {
    repo: over.repo,
    issue_number: over.issue_number,
    title: over.title ?? "t",
    state: over.state ?? "ActionRequired",
    display_hint: over.display_hint ?? "未着手",
    triaged: over.triaged ?? 1,
    pr_number: over.pr_number,
    branch: over.branch,
    head_sha: over.head_sha,
    ci_since: over.ci_since ?? null,
    parent_repo: over.parent_repo,
    parent_issue_number: over.parent_issue_number,
    last_event_at: over.last_event_at,
    last_event_id: over.last_event_id,
  });
  if (
    over.sub_issues_total !== undefined ||
    over.sub_issues_completed !== undefined ||
    over.retry_count !== undefined
  ) {
    db.query(
      "UPDATE items SET sub_issues_total=?, sub_issues_completed=?, retry_count=? WHERE repo=? AND issue_number=?",
    ).run(
      over.sub_issues_total ?? 0,
      over.sub_issues_completed ?? 0,
      over.retry_count ?? 0,
      over.repo,
      over.issue_number,
    );
  }
  return items.getItem(db, over.repo, over.issue_number)!;
}

export function issue(over: Partial<IssueDetail> = {}): IssueDetail {
  return {
    __typename: "Issue",
    id: "I_1",
    number: 1,
    title: "t",
    body: "b",
    state: "OPEN",
    stateReason: null,
    updatedAt: "2026-08-24T00:00:00Z",
    author: { login: "human" },
    parent: null,
    subIssuesSummary: { total: 0, completed: 0, percentCompleted: 0 },
    subIssues: { totalCount: 0, pageInfo: { hasNextPage: false }, nodes: [] },
    comments: { nodes: [] },
    timelineItems: { nodes: [] },
    ...over,
  };
}

export function pr(over: Partial<PrDetail> = {}): PrDetail {
  const oid = over.headRefOid ?? "a".repeat(40);
  return {
    __typename: "PullRequest",
    id: "PR_1",
    number: 10,
    title: "t",
    body: "Closes #1",
    state: "OPEN",
    merged: false,
    isDraft: false,
    updatedAt: "2026-08-24T00:00:00Z",
    headRefName: "feat/x",
    headRefOid: oid,
    baseRefName: "main",
    author: { login: "bot" },
    commits: { nodes: [{ commit: { oid, statusCheckRollup: { state: "SUCCESS" } } }] },
    comments: { nodes: [] },
    reviews: { nodes: [] },
    reviewThreads: { nodes: [] },
    ...over,
  };
}

/** GitHub を叩かないダミー。呼ばれたら記録するだけ。 */
export function fakeGh(over: Partial<GitHubClient> = {}): GitHubClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async graphql<T>(q: string) {
      calls.push(`graphql:${/query (\w+)/.exec(q)?.[1] ?? "?"}`);
      return {
        data: {} as T,
        rate: { cost: 1, remaining: 5000, resetAt: "" },
        date: "2026-08-24T00:00:00Z",
      };
    },
    async rest(path: string) {
      calls.push(`rest:${path}`);
      return new Response("{}", { status: 200 });
    },
    restRemaining: () => 5000,
    async viewerLogin() {
      return "bot";
    },
    ...over,
  } as GitHubClient & { calls: string[] };
}
