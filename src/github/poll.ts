import { DEFAULTS } from "../config.ts";
import type { GitHubClient } from "./client.ts";

/**
 * Phase 1: 変更検知ポーリング。実測 1 pt/リポジトリ。
 *
 * クエリと fingerprint 算出を同じファイルに置く。
 * 別ファイルにすると、クエリに項目を足して fingerprint の更新を忘れる
 * （ARCHITECTURE 方針9 と同じ壊れ方）。必ず両方をここで変える。
 */
export const POLL_QUERY = `
query PollRepository($owner: String!, $repo: String!, $since: DateTime!, $n: Int!) {
  rateLimit { limit cost remaining resetAt }
  repository(owner: $owner, name: $repo) {
    issues(first: $n, orderBy: {field: UPDATED_AT, direction: DESC}, filterBy: {since: $since}) {
      pageInfo { hasNextPage }
      nodes { id number state updatedAt }
    }
    pullRequests(first: $n, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage }
      nodes {
        id number state isDraft updatedAt headRefOid
        comments { totalCount }
        reviews { totalCount }
        reviewThreads { totalCount }
        commits(last: 1) { nodes { commit { oid statusCheckRollup { state } } } }
      }
    }
  }
}`;

export interface PollIssue {
  id: string;
  number: number;
  state: string;
  updatedAt: string;
}

export interface PollPr {
  id: string;
  number: number;
  state: string;
  isDraft: boolean;
  updatedAt: string;
  headRefOid: string;
  comments: { totalCount: number };
  reviews: { totalCount: number };
  reviewThreads: { totalCount: number };
  commits: {
    nodes: Array<{ commit: { oid: string; statusCheckRollup: { state: string } | null } }>;
  };
}

export interface PollResult {
  issues: PollIssue[];
  prs: PollPr[];
  issuesHasNext: boolean;
  prsHasNext: boolean;
}

export async function poll(
  gh: GitHubClient,
  owner: string,
  repo: string,
  since: string,
): Promise<{
  result: PollResult;
  date: string;
  remaining: number;
  limit?: number;
  resetAt?: string;
}> {
  const { data, rate, date } = await gh.graphql<{
    repository: {
      issues: { pageInfo: { hasNextPage: boolean }; nodes: PollIssue[] };
      pullRequests: { pageInfo: { hasNextPage: boolean }; nodes: PollPr[] };
    };
  }>(POLL_QUERY, { owner, repo, since, n: DEFAULTS.phase1PageSize });

  const r = data.repository;
  return {
    result: {
      issues: r.issues.nodes,
      prs: r.pullRequests.nodes,
      issuesHasNext: r.issues.pageInfo.hasNextPage,
      prsHasNext: r.pullRequests.pageInfo.hasNextPage,
    },
    date,
    remaining: rate.remaining,
    limit: rate.limit,
    resetAt: rate.resetAt,
  };
}

/** Issue のフィンガープリント要素: state, updatedAt */
export function issueFingerprint(i: PollIssue): string {
  return hash([i.state, i.updatedAt]);
}

/**
 * PR のフィンガープリント要素（spec.md の一覧と一致させる）。
 * updatedAt が動かないレビュー Submit / インラインコメント / 単発返信 / CI 遷移を
 * totalCount 群と rollup で拾う。ここを変えたら POLL_QUERY も変える。
 */
export function prFingerprint(p: PollPr): string {
  const c = p.commits.nodes[0]?.commit;
  return hash([
    p.state,
    String(p.isDraft),
    p.updatedAt,
    p.headRefOid,
    String(p.comments.totalCount),
    String(p.reviews.totalCount),
    String(p.reviewThreads.totalCount),
    c?.oid ?? "",
    c?.statusCheckRollup?.state ?? "null",
  ]);
}

function hash(parts: string[]): string {
  return Bun.hash(parts.join(" ")).toString(16);
}
