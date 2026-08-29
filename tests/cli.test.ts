import { describe, test, expect, afterEach } from "bun:test";
import { acquireLock } from "../src/cli/utils/lock.ts";
import { c } from "../src/cli/utils/color.ts";
import { doctor } from "../src/cli/doctor.ts";
import { parseCancelTarget } from "../src/cli/cancel.ts";
import { formatStatus, type StateData } from "../src/cli/status.ts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../src/config.ts";

describe("CLI lock utilities", () => {
  const tempDirs: string[] = [];

  const createTempDir = () => {
    const d = mkdtempSync(join(tmpdir(), "autopilot-test-lock-"));
    tempDirs.push(d);
    return d;
  };

  afterEach(() => {
    for (const d of tempDirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* noop */ }
    }
    tempDirs.length = 0;
  });

  test("ロックの正常取得と解放ができる", () => {
    const dir = createTempDir();
    const lockPath = join(dir, "autopilot.lock");

    const lock = acquireLock(lockPath, "boot-1");
    expect("release" in lock).toBe(true);

    // 保持中に再取得を試みると heldBy が返る
    const second = acquireLock(lockPath, "boot-2");
    expect("heldBy" in second).toBe(true);
    if ("heldBy" in second) {
      expect(second.heldBy).toBe(process.pid);
    }

    // 解放
    if ("release" in lock) {
      lock.release();
    }

    // 解放後は再取得可能
    const third = acquireLock(lockPath, "boot-3");
    expect("release" in third).toBe(true);
    if ("release" in third) {
      third.release();
    }
  });

  test("死亡プロセスの残骸ロックファイルを回収して取得できる", () => {
    const dir = createTempDir();
    const lockPath = join(dir, "autopilot.lock");

    // 存在しないPID (OS上でほぼ確実に存在しない値、例: 9999999) を書き込む
    writeFileSync(lockPath, "9999999\nold-boot-id\n");

    const lock = acquireLock(lockPath, "boot-new");
    expect("release" in lock).toBe(true);
    if ("release" in lock) {
      lock.release();
    }
  });
});

describe("CLI color utility", () => {
  test("文字列を適切に装飾またはそのまま返す", () => {
    expect(c.bold("hello")).toContain("hello");
    expect(c.green("ok")).toContain("ok");
    expect(c.red("err")).toContain("err");
    expect(c.boldRed("fatal")).toContain("fatal");
  });
});

describe("CLI cancel parser", () => {
  test("正常なターゲット指定をパースできる", () => {
    const res = parseCancelTarget("owner/repo#42");
    expect(res.repo).toBe("owner/repo");
    expect(res.issueNumber).toBe(42);
  });

  test("引数が無い場合はエラーを投げる", () => {
    expect(() => parseCancelTarget(undefined)).toThrow("usage: autopilot cancel");
  });

  test("不正なターゲット形式の場合はエラーを投げる", () => {
    expect(() => parseCancelTarget("invalid-format")).toThrow("bad target");
  });
});

describe("CLI status formatter", () => {
  test("各レーンのカードを正しくフォーマットする", () => {
    const mockState: StateData = {
      generated_at: "2026-08-29T00:00:00Z",
      lanes: {
        action_required: [
          {
            repo: "owner/repo",
            issue_number: 10,
            pr_number: 11,
            title: "テストタスク",
            display_hint: "仕様確認待ち",
            url: "https://github.com/owner/repo/pull/11",
            issue_url: "https://github.com/owner/repo/issues/10",
            pr_url: "https://github.com/owner/repo/pull/11",
            state_since: "2026-08-29T00:00:00Z",
            queue_position: null,
            job_type: null,
            started_at: null,
          },
        ],
        backlog: [],
        working: [
          {
            repo: "owner/repo",
            issue_number: 20,
            pr_number: 0,
            title: "実装中タスク",
            display_hint: "implement",
            url: "https://github.com/owner/repo/issues/20",
            issue_url: "https://github.com/owner/repo/issues/20",
            pr_url: null,
            state_since: "2026-08-29T00:00:00Z",
            queue_position: null,
            job_type: "implement",
            started_at: "2026-08-29T00:00:00Z",
          },
        ],
        queued: [],
      },
      health: {
        graphql_remaining: 5000,
        graphql_limit: 5000,
        graphql_reset_at: null,
        rest_remaining: 5000,
        rest_limit: 5000,
        rest_reset_at: null,
        running_jobs: 1,
        last_poll_at: "2026-08-29T00:00:00Z",
        degraded: ["レートリミット待機中"],
      },
    };

    const out = formatStatus(mockState);
    expect(out).toContain("🧑 Action Required (1)");
    expect(out).toContain("owner/repo#10 (PR #11)");
    expect(out).toContain("仕様確認待ち");
    expect(out).toContain("🤖 Working (1)");
    expect(out).toContain("owner/repo#20");
    expect(out).toContain("📦 Queued (0)");
    expect(out).toContain("!  レートリミット待機中");
  });
});

describe("CLI doctor logic", () => {
  test("正常系: 全てのチェックがパスする", async () => {
    const mockCfg: Config = {
      home: "/tmp",
      token: "test-token",
      repos: [{ owner: "test-owner", name: "test-repo" }],
      allowlist: ["human-user"],
      agents: {
        triage: { command: "git", timeout_sec: 60 },
        refine: { command: "git", timeout_sec: 60 },
        implement: { command: "git", timeout_sec: 60 },
        evaluate: { command: "git", timeout_sec: 60 },
      },
      queue: { max_parallel: 2 },
      dashboard: { host: "127.0.0.1", port: 8787 },
    };

    const mockGh = {
      viewerLogin: async () => "autopilot-bot",
      graphql: async (query: string) => {
        if (query.includes("Doctor")) {
          return {
            data: {
              rateLimit: { cost: 1, remaining: 5000, resetAt: "2026-08-29T00:00:00Z" },
              repository: {
                isPrivate: true,
                viewerPermission: "ADMIN",
                defaultBranchRef: { name: "main" },
                gate: { __typename: "Blob" },
                workflows: { __typename: "Tree" },
              },
            },
          };
        }
        return { data: { repository: { issues: { nodes: [] } } } };
      },
      rest: async () => ({
        ok: true,
        json: async () => ({
          resources: {
            core: { limit: 5000, remaining: 4999, reset: 1700000000 },
            graphql: { limit: 5000, remaining: 4999, reset: 1700000000 },
          },
        }),
      }),
      restRemaining: () => 5000,
      restLimit: () => 5000,
      restResetAt: () => "2026-08-29T00:00:00Z",
    } as any;

    const checks = await doctor(mockCfg, mockGh);
    expect(checks.length).toBeGreaterThan(0);
    const fatal = checks.filter((c) => c.level === "fatal");
    expect(fatal.length).toBe(0);
  });

  test("異常系: botLogin が allowlist に含まれている場合は fatal になる", async () => {
    const mockCfg: Config = {
      home: "/tmp",
      token: "test-token",
      repos: [{ owner: "test-owner", name: "test-repo" }],
      allowlist: ["my-bot-account"], // botLogin と同じ
      agents: {
        triage: { command: "git", timeout_sec: 60 },
        refine: { command: "git", timeout_sec: 60 },
        implement: { command: "git", timeout_sec: 60 },
        evaluate: { command: "git", timeout_sec: 60 },
      },
      queue: { max_parallel: 2 },
      dashboard: { host: "127.0.0.1", port: 8787 },
    };

    const mockGh = {
      viewerLogin: async () => "my-bot-account",
      graphql: async () => ({
        data: {
          rateLimit: { cost: 1, remaining: 5000, resetAt: "2026-08-29T00:00:00Z" },
          repository: {
            isPrivate: true,
            viewerPermission: "ADMIN",
            defaultBranchRef: { name: "main" },
          },
        },
      }),
      rest: async () => ({ ok: false }),
      restRemaining: () => 5000,
      restLimit: () => 5000,
      restResetAt: () => "2026-08-29T00:00:00Z",
    } as any;

    const checks = await doctor(mockCfg, mockGh);
    const fatal = checks.filter((c) => c.level === "fatal");
    expect(fatal.some((f) => f.detail.includes("allowlist に含まれている"))).toBe(true);
  });
});
