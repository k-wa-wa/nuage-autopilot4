import type { GitHubClient } from "./client.ts";
import { DEFAULTS } from "../config.ts";

/**
 * 成果物検証（ARCHITECTURE 方針8「エージェントの exit 0 を信用しない」）。
 *
 * 照合は必ず databaseId で行う。時刻で照合してはならない
 * （started_at はローカル時計、createdAt は GitHub サーバ時刻。ドリフトで取りこぼす）。
 */

const SNAPSHOT_QUERY = `
query Snapshot($owner: String!, $repo: String!, $issue: Int!, $pr: Int!, $withPr: Boolean!) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $repo) {
    issue(number: $issue) { comments(last: 20) { nodes { databaseId author { login } } } }
    pullRequest(number: $pr) @include(if: $withPr) {
      headRefOid
      comments(last: 20) { nodes { databaseId author { login } } }
    }
  }
}`;

const FIND_PR_QUERY = `
query FindPr($owner: String!, $repo: String!) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $repo) {
    pullRequests(first: 20, states: [OPEN], orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes { number body headRefName headRefOid isDraft author { login } }
    }
  }
}`;

export interface Snapshot {
  /** 全コメントの最大 databaseId。「これより新しい」を判定する水位。 */
  maxIssueCommentId: number;
  maxPrCommentId: number;
  headSha: string;
}

interface CommentNode {
  databaseId: number;
  author: { login: string } | null;
}

interface SnapshotResponse {
  repository: {
    issue: { comments: { nodes: CommentNode[] } } | null;
    pullRequest?: { headRefOid: string; comments: { nodes: CommentNode[] } } | null;
  };
}

async function fetchComments(
  gh: GitHubClient, repo: string, issue: number, pr: number,
): Promise<{ issue: CommentNode[]; pr: CommentNode[]; headSha: string }> {
  const [owner, name] = repo.split("/") as [string, string];
  const { data } = await gh.graphql<SnapshotResponse>(SNAPSHOT_QUERY, {
    owner, repo: name, issue, pr: pr || 1, withPr: pr > 0,
  });
  return {
    issue: data.repository.issue?.comments.nodes ?? [],
    pr: data.repository.pullRequest?.comments.nodes ?? [],
    headSha: data.repository.pullRequest?.headRefOid ?? "",
  };
}

/** エージェント起動の直前に GitHub から取る。DB の値を使ってはならない。 */
export async function takeSnapshot(
  gh: GitHubClient,
  repo: string,
  issue: number,
  pr: number,
): Promise<Snapshot> {
  const c = await fetchComments(gh, repo, issue, pr);
  return {
    maxIssueCommentId: maxId(c.issue),
    maxPrCommentId: maxId(c.pr),
    headSha: c.headSha,
  };
}

/**
 * bot の新しいコメントが存在するか。
 *
 * 「水位より新しいコメントがある」だけでは足りない。人間が同じ間にコメントしただけで
 * 成功と判定してしまい、方針8（exit 0 を信用しない）が骨抜きになる。
 * author.login == bot_login かつ databaseId > 水位、の両方を満たすものを探す。
 *
 * 反映遅延を見込み 2 秒間隔で最大 15 秒リトライしてから偽を返す。
 */
export async function botCommentedSince(
  gh: GitHubClient,
  repo: string,
  issue: number,
  pr: number,
  botLogin: string,
  snap: Snapshot,
  target: "issue" | "pr",
  retries: number = DEFAULTS.verifyRetries,
): Promise<boolean> {
  const watermark = target === "issue" ? snap.maxIssueCommentId : snap.maxPrCommentId;
  return retrying(async () => {
    const c = await fetchComments(gh, repo, issue, pr);
    const nodes = target === "issue" ? c.issue : c.pr;
    return nodes.some((n) => n.author?.login === botLogin && n.databaseId > watermark);
  }, retries);
}

/** 既存 PR の修正 push 検証。実行前スナップショットから head_sha が変化したか。 */
export async function headChangedSince(
  gh: GitHubClient,
  repo: string,
  issue: number,
  pr: number,
  snap: Snapshot,
  retries: number = DEFAULTS.verifyRetries,
): Promise<boolean> {
  return retrying(async () => {
    const c = await fetchComments(gh, repo, issue, pr);
    return c.headSha !== "" && c.headSha !== snap.headSha;
  }, retries);
}

export interface FoundPr {
  number: number;
  branch: string;
  headSha: string;
  isDraft: boolean;
}

/**
 * 新規 PR の特定。timeline は反映が遅いので使わない。
 * OPEN な PR のうち bot 作成かつ本文に Closes #<issue> を含むものを探す。
 */
export async function findNewPr(
  gh: GitHubClient,
  repo: string,
  issue: number,
  botLogin: string,
): Promise<FoundPr | null> {
  const [owner, name] = repo.split("/") as [string, string];
  const re = closesRe(issue);
  let found: FoundPr | null = null;
  await retrying(async () => {
    const { data } = await gh.graphql<{
      repository: {
        pullRequests: {
          nodes: Array<{
            number: number;
            body: string;
            headRefName: string;
            headRefOid: string;
            isDraft: boolean;
            author: { login: string } | null;
          }>;
        };
      };
    }>(FIND_PR_QUERY, { owner, repo: name });
    const hit = data.repository.pullRequests.nodes.find(
      (p) => p.author?.login === botLogin && re.test(p.body ?? ""),
    );
    if (!hit) return false;
    found = {
      number: hit.number,
      branch: hit.headRefName,
      headSha: hit.headRefOid,
      isDraft: hit.isDraft,
    };
    return true;
  });
  return found;
}

/** Closes / Fixes / Resolves のいずれか（GitHub が認識するキーワード）。 */
export function closesRe(issue: number): RegExp {
  return new RegExp(`\\b(clos(e|es|ed)|fix(es|ed)?|resolv(e|es|ed))\\s+#${issue}\\b`, "i");
}

/** 本文に Closes が無ければ AgentWorker が末尾に追記して補正してよい。 */
export async function appendCloses(
  gh: GitHubClient,
  repo: string,
  pr: number,
  issue: number,
  body: string,
): Promise<void> {
  await gh.rest(`/repos/${repo}/pulls/${pr}`, {
    method: "PATCH",
    body: JSON.stringify({ body: `${body}\n\nCloses #${issue}` }),
  });
}

/** 反映遅延を吸収するためのリトライ。回数はテストからのみ差し替える。 */
async function retrying(fn: () => Promise<boolean>, retries: number = DEFAULTS.verifyRetries): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    if (await fn()) return true;
    if (i < retries - 1) await Bun.sleep(DEFAULTS.verifyIntervalMs);
  }
  return false;
}

function maxId(nodes: CommentNode[]): number {
  return nodes.reduce((m, n) => Math.max(m, n.databaseId ?? 0), 0);
}
