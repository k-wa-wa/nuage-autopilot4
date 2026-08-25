import type { GitHubClient } from "./client.ts";
import { DEFAULTS } from "../config.ts";

/** Phase 2: 詳細取得。ids は 100 件ごとに分割。変更 0 件なら発行しない。 */
export const DETAIL_QUERY = `
query FetchDetails($ids: [ID!]!, $subs: Int!, $comments: Int!) {
  rateLimit { cost remaining resetAt }
  nodes(ids: $ids) {
    __typename
    ... on Issue {
      id number title body state stateReason updatedAt
      author { login }
      parent { number repository { nameWithOwner } }
      subIssuesSummary { total completed percentCompleted }
      subIssues(first: $subs) {
        totalCount pageInfo { hasNextPage }
        nodes { number state stateReason repository { nameWithOwner } }
      }
      comments(last: $comments) { nodes { databaseId body createdAt author { login } } }
      timelineItems(last: 10, itemTypes: [CONNECTED_EVENT, CROSS_REFERENCED_EVENT]) {
        nodes {
          ... on ConnectedEvent { subject { ... on PullRequest { number state merged } } }
          ... on CrossReferencedEvent { source { ... on PullRequest { number state merged } } }
        }
      }
    }
    ... on PullRequest {
      id number title body state merged isDraft updatedAt
      headRefName headRefOid baseRefName
      author { login }
      commits(last: 1) { nodes { commit { oid statusCheckRollup { state } } } }
      comments(last: $comments) { nodes { databaseId body createdAt author { login } } }
      reviews(last: 10) { nodes { databaseId state body submittedAt author { login } } }
      reviewThreads(last: 10) {
        nodes { isResolved comments(last: 3) { nodes { databaseId body createdAt path line author { login } } } }
      }
    }
  }
}`;

export interface Comment {
  databaseId: number;
  body: string;
  createdAt: string;
  author: { login: string } | null;
}

export interface Review {
  databaseId: number;
  state: string;
  body: string;
  submittedAt: string;
  author: { login: string } | null;
}

export interface SubIssue {
  number: number;
  state: string;
  stateReason: string | null;
  repository: { nameWithOwner: string };
}

export interface PrRef {
  number: number;
  state: string;
  merged: boolean;
}

export interface IssueDetail {
  __typename: "Issue";
  id: string;
  number: number;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED";
  stateReason: "COMPLETED" | "NOT_PLANNED" | "REOPENED" | null;
  updatedAt: string;
  author: { login: string } | null;
  parent: { number: number; repository: { nameWithOwner: string } } | null;
  subIssuesSummary: { total: number; completed: number; percentCompleted: number };
  subIssues: { totalCount: number; pageInfo: { hasNextPage: boolean }; nodes: SubIssue[] };
  comments: { nodes: Comment[] };
  timelineItems: { nodes: Array<{ subject?: PrRef | null; source?: PrRef | null }> };
}

export interface PrDetail {
  __typename: "PullRequest";
  id: string;
  number: number;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  merged: boolean;
  isDraft: boolean;
  updatedAt: string;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  author: { login: string } | null;
  commits: { nodes: Array<{ commit: { oid: string; statusCheckRollup: { state: string } | null } }> };
  comments: { nodes: Comment[] };
  reviews: { nodes: Review[] };
  reviewThreads: { nodes: Array<{ isResolved: boolean; comments: { nodes: Comment[] } }> };
}

export type Detail = IssueDetail | PrDetail;

export async function fetchDetails(gh: GitHubClient, ids: string[]): Promise<Detail[]> {
  const out: Detail[] = [];
  for (let i = 0; i < ids.length; i += DEFAULTS.phase2ChunkSize) {
    const chunk = ids.slice(i, i + DEFAULTS.phase2ChunkSize);
    const { data } = await gh.graphql<{ nodes: Array<Detail | null> }>(DETAIL_QUERY, {
      ids: chunk,
      subs: DEFAULTS.subIssuePageSize,
      comments: DEFAULTS.commentPageSize,
    });
    for (const n of data.nodes) if (n) out.push(n);
  }
  return out;
}

/** timeline から紐づく PR 番号を取る。取れなければ null（次周期で拾う）。 */
export function linkedPrNumber(issue: IssueDetail): number | null {
  for (const n of issue.timelineItems.nodes) {
    const pr = n.subject ?? n.source;
    if (pr?.number) return pr.number;
  }
  return null;
}

export const rollupState = (pr: PrDetail): string | null =>
  pr.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null;

export const headOid = (pr: PrDetail): string => pr.commits.nodes[0]?.commit.oid ?? "";
