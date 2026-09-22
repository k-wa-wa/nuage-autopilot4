import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.ts";
import { ensureChatWorkspace, type GitRunner } from "./workspace.ts";

describe("ensureChatWorkspace (Chat 専用調査ワークスペース)", () => {
  const dummyCfg: Config = {
    home: "/tmp/autopilot-chat-test",
    token: "dummy-token",
    repos: [],
    allowlist: [],
    dashboard: { host: "127.0.0.1", port: 4000 },
    agents: {
      triage: { command: "claude", timeout_sec: 60 },
      refine: { command: "claude", timeout_sec: 60 },
      implement: { command: "claude", timeout_sec: 60 },
      evaluate: { command: "agy", timeout_sec: 60 },
    },
    queue: { max_parallel: 2 },
  };

  it("未クローンの場合: git clone を実行して初期化する", async () => {
    const calls: Array<{ args: string[]; cwd: string }> = [];
    const mockGit: GitRunner = async (args, cwd) => {
      calls.push({ args, cwd });
      return { code: 0, stdout: "", stderr: "" };
    };

    const targetRepo = `test-org/new-repo-${Date.now()}`;
    const dir = await ensureChatWorkspace(dummyCfg, targetRepo, undefined, mockGit);

    expect(dir).toBe(join(dummyCfg.home, "chat-workspaces", targetRepo));

    // clone コマンドが実行されたことを確認
    const cloneCall = calls.find((c) => c.args.includes("clone"));
    expect(cloneCall).toBeDefined();
    expect(cloneCall!.args).toContain(`https://github.com/${targetRepo}.git`);

    // reset / clean が実行されたことを確認
    expect(calls.some((c) => c.args.includes("reset") && c.args.includes("--hard"))).toBe(true);
    expect(calls.some((c) => c.args.includes("clean") && c.args.includes("-fd"))).toBe(true);
  });

  it("既クローンの場合: git fetch とクリーンアップを実行する", async () => {
    const calls: Array<{ args: string[]; cwd: string }> = [];
    const mockGit: GitRunner = async (args, cwd) => {
      calls.push({ args, cwd });
      return { code: 0, stdout: "", stderr: "" };
    };

    const targetRepo = `test-org/existing-repo-${Date.now()}`;
    const targetDir = join(dummyCfg.home, "chat-workspaces", targetRepo);
    mkdirSync(join(targetDir, ".git"), { recursive: true });
    writeFileSync(join(targetDir, "sample.txt"), "hello");

    const dir = await ensureChatWorkspace(dummyCfg, targetRepo, "feature/fix", mockGit);

    expect(dir).toBe(targetDir);

    // clone は呼ばれず、fetch が呼ばれたことを確認
    expect(calls.some((c) => c.args.includes("clone"))).toBe(false);
    expect(calls.some((c) => c.args.includes("fetch"))).toBe(true);

    // ブランチのチェックアウトが試行されたことを確認
    expect(calls.some((c) => c.args.includes("checkout") && c.args.includes("feature/fix"))).toBe(
      true,
    );
  });
});
