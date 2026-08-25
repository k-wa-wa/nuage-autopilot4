import { DEFAULTS } from "../config.ts";

export interface RateLimit { cost: number; remaining: number; resetAt: string }

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly kind: "unauthorized" | "rate_limited" | "not_found" | "forbidden" | "partial" | "network",
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface GitHubClient {
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<{ data: T; rate: RateLimit; date: string }>;
  rest(path: string, init?: RequestInit): Promise<Response>;
  restRemaining(): number;
  viewerLogin(): Promise<string>;
}

export function createClient(token: string): GitHubClient {
  let restRemaining = 5000;

  async function graphql<T>(query: string, variables: Record<string, unknown>) {
    const res = await withBackoff(() =>
      fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: { authorization: `bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      }),
    );
    const date = res.headers.get("date") ?? new Date().toUTCString();
    const text = await res.text();

    // HTTP レベルの失敗は GraphQL の errors 配列に載らない。
    // ここを見ないと、認証失敗（最も多い設定ミス）が「empty data」になって原因が分からない。
    if (!res.ok) {
      const msg = safeMessage(text) ?? text.slice(0, 200);
      if (res.status === 401) throw new GitHubError(`認証に失敗しました（GH_TOKEN を確認）: ${msg}`, "unauthorized");
      if (res.status === 403) throw new GitHubError(msg, "forbidden");
      if (res.status === 404) throw new GitHubError(msg, "not_found");
      throw new GitHubError(`HTTP ${res.status}: ${msg}`, "network");
    }

    let body: { data?: T & { rateLimit?: RateLimit }; errors?: Array<{ type?: string; message: string }> };
    try {
      body = JSON.parse(text);
    } catch {
      throw new GitHubError(`JSON として解釈できない応答: ${text.slice(0, 200)}`, "network");
    }

    if (body.errors?.length) {
      const t = body.errors[0]?.type;
      // HTTP 200 + errors + 部分 data。部分データを upsert すると欠落が確定するので周期ごとスキップ。
      if (t === "RATE_LIMITED") throw new GitHubError("rate limited", "rate_limited");
      if (t === "NOT_FOUND") throw new GitHubError(body.errors[0]!.message, "not_found");
      if (t === "FORBIDDEN") throw new GitHubError(body.errors[0]!.message, "forbidden");
      throw new GitHubError(body.errors.map((e) => e.message).join("; "), "partial");
    }
    if (!body.data) throw new GitHubError(`data が空: ${text.slice(0, 200)}`, "partial");

    const rate = body.data.rateLimit ?? { cost: 0, remaining: 5000, resetAt: "" };
    return { data: body.data as T, rate, date: new Date(date).toISOString().replace(/\.\d{3}Z$/, "Z") };
  }

  async function rest(path: string, init: RequestInit = {}) {
    const res = await withBackoff(() =>
      fetch(`https://api.github.com${path}`, {
        ...init,
        headers: { authorization: `bearer ${token}`, accept: "application/vnd.github+json", ...(init.headers ?? {}) },
      }),
    );
    const r = res.headers.get("x-ratelimit-remaining");
    if (r) restRemaining = Number(r);
    return res;
  }

  return {
    graphql,
    rest,
    restRemaining: () => restRemaining,
    async viewerLogin() {
      const { data } = await graphql<{ viewer: { login: string } }>("query { viewer { login } }", {});
      return data.viewer.login;
    },
  };
}

function safeMessage(text: string): string | null {
  try {
    const o = JSON.parse(text) as { message?: string };
    return typeof o.message === "string" ? o.message : null;
  } catch {
    return null;
  }
}

/** 二次レートリミット（Retry-After）と一過性エラーに指数バックオフ。 */
async function withBackoff(fn: () => Promise<Response>, max = 3): Promise<Response> {
  let wait = 60_000;
  for (let i = 0; ; i++) {
    let res: Response;
    try {
      res = await fn();
    } catch (e) {
      if (i >= max) throw new GitHubError(String(e), "network");
      await Bun.sleep(Math.min(1000 * 2 ** i, 15_000));
      continue;
    }
    if (res.status !== 403 && res.status !== 429) return res;
    // 認証失敗はリトライしても直らないので即座に返す（403 は権限不足と二次制限が混在する）。
    if (res.status === 403 && !res.headers.get("retry-after") && i > 0) return res;
    if (i >= max) return res;
    const ra = Number(res.headers.get("retry-after"));
    await Bun.sleep(ra ? ra * 1000 : Math.min(wait, 15 * 60_000));
    wait *= 2;
  }
}

export const rateLimitState = {
  graphqlRemaining: 5000,
  restRemaining: 5000,
  resetAt: "",
  /** remaining < 1000 で 300 秒、< 200 で resetAt まで停止（spec.md §11 未実装だが枠は持つ）。 */
  pollIntervalMs(): number {
    return this.graphqlRemaining < DEFAULTS.rateLimitSlowRemaining
      ? DEFAULTS.rateLimitSlowMs
      : DEFAULTS.pollIntervalMs;
  },
  stopped(): boolean {
    return this.graphqlRemaining < DEFAULTS.rateLimitStopRemaining;
  },
};
