import { describe, expect, test } from "bun:test";
import { memDb, seedItem, issue, fakeGh } from "./helpers.ts";
import * as items from "../src/store/items.ts";
import * as jobs from "../src/store/jobs.ts";
import { forcedSync } from "../src/decide/sync.ts";
import { botCommentedSince, takeSnapshot } from "../src/github/verify.ts";
import { buildInvocation } from "../src/execute/adapters.ts";

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
