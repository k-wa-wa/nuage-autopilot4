import { describe, expect, test } from "bun:test";
import type { Config } from "../src/config.ts";
import type { DispatchDeps } from "../src/decide/dispatcher.ts";
import { dispatch } from "../src/decide/dispatcher.ts";

import type { WorkerDeps } from "../src/execute/worker.ts";
import { runOnce } from "../src/execute/worker.ts";
import * as cache from "../src/store/cache.ts";
import * as jobs from "../src/store/jobs.ts";
import { fakeGh, issue, memDb, seedItem } from "./helpers.ts";

function testConfig(): Config {
  return {
    home: "/tmp/autopilot-test",
    token: "token",
    allowlist: ["human"],
    repos: [{ owner: "o", name: "r", base_branch: "main" }],
    dashboard: { host: "127.0.0.1", port: 4040 },
    queue: { max_parallel: 1 },
    agents: {
      triage: { command: "dummy", timeout_sec: 30 },
      refine: { command: "dummy", timeout_sec: 30 },
      implement: { command: "dummy", timeout_sec: 30 },
      evaluate: { command: "dummy", timeout_sec: 30 },
    },
  };
}

describe("ログ仕様 (docs/logging.md) の準拠テスト", () => {
  test("Worker がジョブ開始時と失敗時に仕様通りのログを出力する", async () => {
    const db = memDb();
    seedItem(db, { repo: "o/r", issue_number: 1, state: "Queued", display_hint: "着手待ち" });
    const jobId = jobs.enqueueJob(db, {
      repo: "o/r",
      issue_number: 1,
      job_type: "refine",
      job_context: "ctx",
      trigger_key: "k1",
    })!;

    const logs: Array<{ level: string; msg: string }> = [];
    const wd: WorkerDeps = {
      db,
      cfg: testConfig(),
      gh: fakeGh(),
      botLogin: "bot",
      bootId: "boot-1",
      baseBranchOf: () => "main",
      log: (level, msg) => logs.push({ level, msg }),
    };

    // runOnce は agent コマンド "dummy" の実行で失敗する（実行環境に dummy がないか失敗）
    await runOnce(wd);

    // 開始ログが出力されていること
    expect(
      logs.some((l) => l.level === "info" && l.msg === `o/r#1: job ${jobId} (refine) started`),
    ).toBe(true);

    // 失敗ログが出力されていること（所要時間付き）
    expect(
      logs.some(
        (l) => l.level === "warn" && l.msg.startsWith(`o/r#1: job ${jobId} (refine) failed`),
      ),
    ).toBe(true);
  });

  test("Dispatcher がキュー投入時や同期時に仕様通りのログを出力する", async () => {
    const db = memDb();
    seedItem(db, {
      repo: "o/r",
      issue_number: 2,
      state: "ActionRequired",
      display_hint: "仕様確認待ち",
    });

    cache.upsertDetail(
      db,
      "o/r",
      "issue",
      2,
      "I_2",
      {
        __typename: "Issue",
        id: "I_2",
        number: 2,
        title: "Test",
        body: "body",
        state: "OPEN",
        stateReason: null,
        updatedAt: "2026-08-24T00:00:00Z",
        author: { login: "human" },
        parent: null,
        subIssuesSummary: { total: 0, completed: 0, percentCompleted: 0 },
        subIssues: { totalCount: 0, pageInfo: { hasNextPage: false }, nodes: [] },
        comments: {
          nodes: [
            {
              databaseId: 100,
              author: { login: "human" },
              body: "OK",
              createdAt: "2026-08-24T01:00:00Z",
            },
          ],
        },
        timelineItems: { nodes: [] },
      },
      "2026-08-24T01:00:00Z",
    );

    const logs: Array<{ level: string; msg: string }> = [];
    const dd: DispatchDeps = {
      db,
      cfg: testConfig(),
      gh: fakeGh(),
      botLogin: "bot",
      monitored: new Set(["o/r"]),
      log: (level, msg) => logs.push({ level, msg }),
    };

    await dispatch(dd, "o/r", 2);

    // 新規イベントの検知ログ。発信者は newEvents() が抽出したものをそのまま出す。
    expect(
      logs.some((l) => l.level === "info" && l.msg === "o/r#2: detected new comment by @human"),
    ).toBe(true);
    // FastPass によるキュー投入ログ
    expect(
      logs.some((l) => l.level === "info" && l.msg === "o/r#2: enqueue implement (comment:100)"),
    ).toBe(true);
  });

  test("強制同期がジョブを積んだ経路でも enqueue ログを出す", async () => {
    const db = memDb();
    // 未 Triage の新規起票。forcedSync の new-issue ルールが refine を積む。
    seedItem(db, {
      repo: "o/r",
      issue_number: 3,
      state: "ActionRequired",
      display_hint: "未着手",
      triaged: 0,
    });
    cache.upsertDetail(
      db,
      "o/r",
      "issue",
      3,
      "I_3",
      issue({ id: "I_3", number: 3, author: { login: "human" } }),
      "2026-08-24T00:00:00Z",
    );

    const logs: Array<{ level: string; msg: string }> = [];
    const dd: DispatchDeps = {
      db,
      cfg: testConfig(),
      gh: fakeGh(),
      botLogin: "bot",
      monitored: new Set(["o/r"]),
      log: (level, msg) => logs.push({ level, msg }),
    };

    await dispatch(dd, "o/r", 3);

    expect(logs.some((l) => l.level === "info" && l.msg === "o/r#3: sync=new-issue")).toBe(true);
    expect(logs.some((l) => l.level === "info" && l.msg === "o/r#3: enqueue refine (open:3)")).toBe(
      true,
    );
  });
});
