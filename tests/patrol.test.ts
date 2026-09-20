import { beforeEach, describe, expect, test } from "bun:test";
import { pollRepo } from "../src/collect/poller.ts";
import type { Config } from "../src/config.ts";
import { patrolIntervalMs } from "../src/config.ts";
import type { DispatchDeps } from "../src/decide/dispatcher.ts";
import { dispatch } from "../src/decide/dispatcher.ts";
import type { PatrolDeps } from "../src/execute/patrol.ts";
import {
  PATROL_LABEL,
  patrol,
  patrolCursorName,
  patrolPrompt,
  resetPatrolThrottle,
} from "../src/execute/patrol.ts";
import * as cache from "../src/store/cache.ts";
import * as cursors from "../src/store/cursors.ts";
import * as items from "../src/store/items.ts";
import * as jobs from "../src/store/jobs.ts";
import { fakeGh, issue, memDb } from "./helpers.ts";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-09-21T00:00:00Z");

function cfg(patrolOn: boolean | { interval_hours?: number } | undefined): Config {
  return {
    home: "/tmp/autopilot-test",
    token: "token",
    allowlist: ["human"],
    repos: [{ owner: "o", name: "r", base_branch: "main", patrol: patrolOn }],
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

/** GitHub 上の巡回 Issue 一覧を返すダミー。`onList` が呼ばれるたびに次の一覧を返す。 */
function ghWith(lists: Array<Array<Record<string, unknown>>>) {
  let n = 0;
  const paths: string[] = [];
  const gh = fakeGh({
    async rest(path: string) {
      paths.push(path);
      if (path.includes("/issues?")) {
        return new Response(JSON.stringify(lists[Math.min(n++, lists.length - 1)]), {
          status: 200,
        });
      }
      return new Response("{}", { status: 201 });
    },
  });
  return { gh, paths };
}

function deps(c: Config, gh: PatrolDeps["gh"], db = memDb()): PatrolDeps & { logs: string[] } {
  const logs: string[] = [];
  return {
    db,
    cfg: c,
    gh,
    botLogin: "bot",
    baseBranchOf: () => "main",
    log: (_l, m) => logs.push(m),
    logs,
  };
}

/** 呼ばれた回数を数えるエージェントのダミー。 */
function counted(result = "ok") {
  const run = Object.assign(
    async () => {
      run.calls++;
      return result;
    },
    { calls: 0 },
  );
  return run;
}

const at = (ms: number) => new Date(ms).toISOString();

describe("定期巡回: 起票の判断", () => {
  beforeEach(resetPatrolThrottle);

  test("無効なリポジトリでは GitHub を呼ばない", async () => {
    const { gh, paths } = ghWith([[]]);
    const run = counted();
    await patrol(deps(cfg(undefined), gh), NOW, run);
    expect(run.calls).toBe(0);
    expect(paths).toEqual([]);
  });

  test("巡回 Issue が無ければエージェントを走らせ、新しい Issue を確認して成功とする", async () => {
    const { gh } = ghWith([[], [{ number: 7, state: "open", created_at: at(NOW) }]]);
    const d = deps(cfg(true), gh);
    const run = counted();
    const n = await patrol(d, NOW, run);
    expect(run.calls).toBe(1);
    expect(n).toBe(1);
    expect(d.logs).toContain("o/r#7: patrol issue created");
    expect(cursors.getCursor(d.db, patrolCursorName("o/r"))).not.toBeNull();
  });

  test("exit 0 でも Issue が増えていなければ起票扱いにしない", async () => {
    const { gh } = ghWith([[], []]);
    const d = deps(cfg(true), gh);
    const n = await patrol(d, NOW, async () => "ok");
    expect(n).toBe(0);
    expect(d.logs).toContain("o/r: patrol finished (no issue created)");
  });

  test("エージェントが失敗したら警告を出す", async () => {
    const { gh } = ghWith([[], []]);
    const d = deps(cfg(true), gh);
    await patrol(d, NOW, async () => "timeout");
    expect(d.logs).toContain("o/r: patrol failed: timeout");
  });

  test("未クローズの巡回 Issue が残っている間は起票しない", async () => {
    const { gh } = ghWith([[{ number: 3, state: "open", created_at: at(NOW - 999 * HOUR) }]]);
    const run = counted();
    await patrol(deps(cfg(true), gh), NOW, run);
    expect(run.calls).toBe(0);
  });

  test("直近の巡回から interval 経っていなければ起票しない", async () => {
    const { gh } = ghWith([[{ number: 3, state: "closed", created_at: at(NOW - 24 * HOUR) }]]);
    const run = counted();
    await patrol(deps(cfg({ interval_hours: 48 }), gh), NOW, run);
    expect(run.calls).toBe(0);
  });

  test("interval を過ぎていれば起票する", async () => {
    const { gh } = ghWith([
      [{ number: 3, state: "closed", created_at: at(NOW - 49 * HOUR) }],
      [
        { number: 4, state: "open", created_at: at(NOW) },
        { number: 3, state: "closed", created_at: at(NOW - 49 * HOUR) },
      ],
    ]);
    const run = counted();
    const n = await patrol(deps(cfg({ interval_hours: 48 }), gh), NOW, run);
    expect([run.calls, n]).toEqual([1, 1]);
  });

  test("PR は巡回 Issue として数えない", async () => {
    const { gh } = ghWith([
      [{ number: 3, state: "open", created_at: at(NOW), pull_request: {} }],
      [{ number: 4, state: "open", created_at: at(NOW) }],
    ]);
    const run = counted();
    await patrol(deps(cfg(true), gh), NOW, run);
    expect(run.calls).toBe(1);
  });

  test("ジョブが走っていても、人間の Issue が開いていても巡回は止まらない", async () => {
    const { gh } = ghWith([[], [{ number: 9, state: "open", created_at: at(NOW) }]]);
    const d = deps(cfg(true), gh);
    jobs.enqueueJob(d.db, {
      repo: "o/r",
      issue_number: 1,
      job_type: "implement",
      job_context: "c",
      trigger_key: "k",
    });
    const run = counted();
    expect(await patrol(d, NOW, run)).toBe(1);
    expect(run.calls).toBe(1);
  });

  test("何も起票しなくても、試行から interval は再実行しない", async () => {
    const { gh } = ghWith([[], [], []]);
    const d = deps(cfg(true), gh);
    const run = counted();
    await patrol(d, NOW, run);
    // 間引き（10 分）を過ぎても、試行から interval（168h）経つまでは走らない。
    await patrol(d, NOW + 60 * 60_000, run);
    expect(run.calls).toBe(1);
    await patrol(d, NOW + 169 * HOUR, run);
    expect(run.calls).toBe(2);
  });

  test("1 リポジトリの失敗が例外として漏れない", async () => {
    const gh = fakeGh({
      async rest() {
        return new Response("boom", { status: 500 });
      },
    });
    const d = deps(cfg(true), gh);
    expect(await patrol(d, NOW, async () => "ok")).toBe(0);
    expect(d.logs.some((m) => m.startsWith("o/r: patrol failed:"))).toBe(true);
  });
});

describe("定期巡回: 設定とプロンプト", () => {
  test("patrol: true は既定間隔、数値指定はそれに従い、不正値は既定に戻る", () => {
    const r = { owner: "o", name: "r" };
    expect(patrolIntervalMs(r)).toBeNull();
    expect(patrolIntervalMs({ ...r, patrol: false })).toBeNull();
    expect(patrolIntervalMs({ ...r, patrol: true })).toBe(168 * HOUR);
    expect(patrolIntervalMs({ ...r, patrol: { interval_hours: 24 } })).toBe(24 * HOUR);
    expect(patrolIntervalMs({ ...r, patrol: { interval_hours: -1 } })).toBe(168 * HOUR);
  });

  test("プロンプトはラベル付き起票・リポジトリ無変更・起票 1 件を指示する", () => {
    const p = patrolPrompt({ repo: "o/r", base: "main", gate: null });
    expect(p).toContain(`--label ${PATROL_LABEL}`);
    expect(p).toContain("リポジトリを変更しない");
    expect(p).toContain("1 件だけ");
    expect(p).toContain("OK と返信してください");
  });
});

describe("bot が起票した Issue は仕様定義済みとして扱う", () => {
  const rate = { cost: 1, remaining: 5000, resetAt: "" };
  const date = "2026-09-21T00:00:00Z";

  function pollGh(number: number, author: string) {
    const pollResp = {
      data: {
        repository: {
          issues: {
            pageInfo: { hasNextPage: false },
            nodes: [{ id: `I_${number}`, number, state: "OPEN", updatedAt: date }],
          },
          pullRequests: { pageInfo: { hasNextPage: false }, nodes: [] },
        },
      },
      rate,
      date,
    };
    const detailResp = {
      data: { nodes: [issue({ id: `I_${number}`, number, author: { login: author } })] },
      rate,
      date,
    };
    return fakeGh({
      async graphql<T>(q: string) {
        return (/query PollRepository/.test(q) ? pollResp : detailResp) as {
          data: T;
          rate: typeof rate;
          date: string;
        };
      },
    });
  }

  async function register(number: number, author: string) {
    const db = memDb();
    // コールドスタート（全件 triaged=1）を避けるため、既存カーソルを置く。
    cursors.setCursor(db, cursors.syncCursorName("o/r"), "2026-09-01T00:00:00Z");
    await pollRepo(db, pollGh(number, author), { owner: "o", name: "r" }, "bot");
    return { db, it: items.getItem(db, "o/r", number)! };
  }

  test("bot の起票は 仕様確認待ち / triaged=1 で登録され、refine は積まれない", async () => {
    const { db, it } = await register(5, "bot");
    expect([it.state, it.display_hint, it.triaged]).toEqual(["ActionRequired", "仕様確認待ち", 1]);
    expect(jobs.hasActiveJob(db, "o/r", 5)).toBe(false);
  });

  test("人間の起票は従来どおり 未着手 / triaged=0", async () => {
    const { it } = await register(6, "human");
    expect([it.display_hint, it.triaged]).toEqual(["未着手", 0]);
  });

  test("人間の「OK」で FastPass が implement を積む", async () => {
    const { db } = await register(5, "bot");
    const iss = issue({
      id: "I_5",
      number: 5,
      author: { login: "bot" },
      comments: {
        nodes: [
          {
            databaseId: 1,
            body: "OK",
            createdAt: "2099-01-01T00:00:00Z",
            author: { login: "human" },
          },
        ],
      },
    });
    cache.upsertDetail(db, "o/r", "issue", 5, "I_5", iss, iss.updatedAt);
    const dd: DispatchDeps = {
      db,
      cfg: cfg(true),
      gh: fakeGh(),
      botLogin: "bot",
      monitored: new Set(["o/r"]),
      log: () => {},
    };
    await dispatch(dd, "o/r", 5);
    const job = db.query("SELECT job_type FROM job_queue WHERE issue_number=5").get() as {
      job_type: string;
    } | null;
    expect(job?.job_type).toBe("implement");
    expect(items.getItem(db, "o/r", 5)!.display_hint).toBe("着手待ち");
  });
});
