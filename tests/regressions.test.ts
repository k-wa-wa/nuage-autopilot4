import { describe, expect, test } from "bun:test";
import { memDb, seedItem, issue, fakeGh } from "./helpers.ts";
import * as items from "../src/store/items.ts";
import * as jobs from "../src/store/jobs.ts";
import { forcedSync } from "../src/decide/sync.ts";
import { botCommentedSince, takeSnapshot } from "../src/github/verify.ts";
import { buildInvocation } from "../src/execute/adapters.ts";
import { pollRepo } from "../src/collect/poller.ts";

/**
 * 初回実装で埋め込んだ欠陥の回帰テスト。
 * どれも「型では防げず、動かして初めて分かる」種類のものだった。
 */

describe("Done ガードが reopen を殺していた", () => {
  test("reopen は Done から復帰できる", () => {
    const db = memDb();
    const it = seedItem(db, { repo: "o/r", issue_number: 1 });
    const done = items.transitionItem(db, it, { state: "Done", hint: "" });

    const r = forcedSync(db, {
      item: done,
      issue: issue({ state: "OPEN" }),
      pr: null,
      allowlist: ["human"],
      prevIssueState: "CLOSED",
    });

    expect(r.rule).toBe("reopened");
    const after = items.getItem(db, "o/r", 1)!;
    expect(after.state).toBe("Queued");
    expect(after.retry_count).toBe(0);
    expect(after.blocked_from).toBe("");
  });

  test("reopen 以外は Done から動かない（遅れて完了したジョブが巻き戻さない）", () => {
    const db = memDb();
    const it = seedItem(db, { repo: "o/r", issue_number: 1 });
    const done = items.transitionItem(db, it, { state: "Done", hint: "" });
    expect(items.transitionItem(db, done, { state: "Working", hint: "CI 待ち" }).state).toBe("Done");
  });
});

describe("job_context のマージが既存を消していた", () => {
  test("重複投入時に元の文脈が残る", () => {
    const db = memDb();
    const id = jobs.enqueueJob(db, {
      repo: "o/r", issue_number: 1, job_type: "implement",
      job_context: "最初の指示", trigger_key: "k1",
    })!;
    jobs.enqueueJob(db, {
      repo: "o/r", issue_number: 1, job_type: "implement",
      job_context: "追加の指示", trigger_key: "k2",
    });
    const ctx = jobs.getJob(db, id)!.job_context;
    expect(ctx).toContain("最初の指示");
    expect(ctx).toContain("追加の指示");
  });
});

describe("成果物検証が投稿者を見ていなかった", () => {
  const snapQuery = (nodes: Array<{ databaseId: number; login: string }>) =>
    fakeGh({
      async graphql<T>() {
        return {
          data: {
            repository: {
              issue: { comments: { nodes: nodes.map((n) => ({ databaseId: n.databaseId, author: { login: n.login } })) } },
              pullRequest: null,
            },
          } as T,
          rate: { cost: 1, remaining: 5000, resetAt: "" },
          date: "2026-08-24T00:00:00Z",
        };
      },
    });

  test("人間のコメントだけでは成功にならない", async () => {
    const before = await takeSnapshot(snapQuery([{ databaseId: 10, login: "human" }]), "o/r", 1, 0);
    const ok = await botCommentedSince(
      snapQuery([{ databaseId: 10, login: "human" }, { databaseId: 11, login: "human" }]),
      "o/r", 1, 0, "bot", before, "issue", 1,
    );
    expect(ok).toBe(false);
  });

  test("bot の新しいコメントがあれば成功", async () => {
    const before = await takeSnapshot(snapQuery([{ databaseId: 10, login: "human" }]), "o/r", 1, 0);
    const ok = await botCommentedSince(
      snapQuery([{ databaseId: 10, login: "human" }, { databaseId: 11, login: "bot" }]),
      "o/r", 1, 0, "bot", before, "issue",
    );
    expect(ok).toBe(true);
  });

  test("水位より古い bot コメントは成功にしない（前回実行の残り）", async () => {
    const before = await takeSnapshot(snapQuery([{ databaseId: 20, login: "bot" }]), "o/r", 1, 0);
    const ok = await botCommentedSince(
      snapQuery([{ databaseId: 20, login: "bot" }]),
      "o/r", 1, 0, "bot", before, "issue", 1,
    );
    expect(ok).toBe(false);
  });
});

describe("stdin アダプタでプロンプトが消えていた", () => {
  test("claude は常に stdin（ファイルに逃がさない）", () => {
    const inv = buildInvocation(
      { command: "claude", timeout_sec: 900 },
      { promptPath: "/tmp/p.md", timeoutMs: 900_000, elevated: true },
    );
    expect(inv.channel).toBe("stdin");
    expect(inv.argv).toContain("bypassPermissions");
  });

  test("Triage は権限を昇格しない", () => {
    const inv = buildInvocation(
      { command: "claude", model: "haiku", timeout_sec: 120 },
      { promptPath: "/tmp/p.md", timeoutMs: 120_000, elevated: false },
    );
    expect(inv.argv).not.toContain("--permission-mode");
    expect(inv.argv).toContain("haiku");
  });

  test("agy はファイル参照で、ワーカー上限の 30 秒手前を渡す", () => {
    const inv = buildInvocation(
      { command: "agy", timeout_sec: 3600 },
      { promptPath: "/tmp/p.md", timeoutMs: 3_600_000, elevated: true },
    );
    expect(inv.channel).toBe("file");
    expect(inv.argv.join(" ")).toContain("/tmp/p.md");
    expect(inv.argv[inv.argv.indexOf("--print-timeout") + 1]).toBe("3570");
  });
});

describe("Poller の更新が競合で消えていた", () => {
  test("古い version を渡しても head_sha が反映される", () => {
    const db = memDb();
    const stale = seedItem(db, { repo: "o/r", issue_number: 1, pr_number: 10, head_sha: "old" });
    // 別プロセスが先に書いて version が進んだ状況を作る
    items.transitionItem(db, stale, { state: "Working", hint: "実装中" });

    items.refreshFromGitHub(db, stale, { head_sha: "new" });
    expect(items.getItem(db, "o/r", 1)!.head_sha).toBe("new");
  });
});

describe("同じ PR が複数 Issue を close すると poll loop 全体が落ちていた", () => {
  test("2 つ目の Issue には pr_number を紐付けず、クラッシュせずに両方 item 化する", async () => {
    const db = memDb();
    const rate = { cost: 1, remaining: 5000, resetAt: "" };
    const date = "2026-08-24T00:00:00Z";

    const pollResp = {
      data: {
        repository: {
          issues: {
            pageInfo: { hasNextPage: false },
            nodes: [
              { id: "I_4", number: 4, state: "CLOSED", updatedAt: date },
              { id: "I_6", number: 6, state: "CLOSED", updatedAt: date },
            ],
          },
          pullRequests: { pageInfo: { hasNextPage: false }, nodes: [] },
        },
      },
      rate, date,
    };
    const detailResp = {
      data: {
        nodes: [
          issue({ id: "I_4", number: 4, state: "CLOSED", timelineItems: { nodes: [{ subject: { number: 1, state: "OPEN", merged: false } }] } }),
          issue({ id: "I_6", number: 6, state: "CLOSED", timelineItems: { nodes: [{ subject: { number: 1, state: "OPEN", merged: false } }] } }),
        ],
      },
      rate, date,
    };
    const gh = fakeGh({
      async graphql<T>(q: string) {
        return (/query PollRepository/.test(q) ? pollResp : detailResp) as { data: T; rate: typeof rate; date: string };
      },
    });

    const out = await pollRepo(db, gh, { owner: "o", name: "r" }, "bot-login");
    expect(out.error).toBeUndefined();

    const i4 = items.getItem(db, "o/r", 4)!;
    const i6 = items.getItem(db, "o/r", 6)!;
    expect(i4).not.toBeNull();
    expect(i6).not.toBeNull();
    // どちらか一方だけが PR #1 を保持し、もう一方は 0 のまま（unique index を壊さない）。
    const linked = [i4.pr_number, i6.pr_number].sort();
    expect(linked).toEqual([0, 1]);
  });
});

describe("コンパイル済みバイナリでマイグレーションが失敗していた", () => {
  test("openDb がスキーマを適用し user_version を設定する", () => {
    const db = memDb();
    const v = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
    expect(v).toBeGreaterThanOrEqual(1);

    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("items");
    expect(tableNames).toContain("job_queue");
    expect(tableNames).toContain("github_cache");
    expect(tableNames).toContain("runs");
    expect(tableNames).toContain("cursors");
  });
});

