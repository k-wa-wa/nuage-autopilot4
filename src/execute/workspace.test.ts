import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../config.ts";
import { ensureChatWorkspace, type GitRunner, isRepoSlug } from "./workspace.ts";

describe("ensureChatWorkspace (Chat 専用調査ワークスペース)", () => {
  const testDir = mkdtempSync(join(tmpdir(), "autopilot-chat-test-"));
  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const dummyCfg: Config = {
    home: testDir,
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

  const recorder = () => {
    const calls: string[][] = [];
    const git: GitRunner = async (args) => {
      calls.push(args);
      return { code: 0, stdout: "", stderr: "" };
    };
    return { calls, git };
  };
  const cloned = (name: string) => {
    const repo = `test-org/${name}-${Date.now()}`;
    const dir = join(dummyCfg.home, "chat-workspaces", repo);
    mkdirSync(join(dir, ".git"), { recursive: true });
    writeFileSync(join(dir, "sample.txt"), "hello");
    return { repo, dir };
  };

  it("未クローンの場合: git clone だけ行う（clone 直後が既定ブランチの最新）", async () => {
    const { calls, git } = recorder();
    const repo = `test-org/new-repo-${Date.now()}`;
    const dir = await ensureChatWorkspace(dummyCfg, repo, { refresh: false }, git);

    expect(dir).toBe(join(dummyCfg.home, "chat-workspaces", repo));
    const cloneCall = calls.find((a) => a.includes("clone"));
    expect(cloneCall).toContain(`https://github.com/${repo}.git`);
    expect(calls.some((a) => a.includes("checkout") || a.includes("clean"))).toBe(false);
  });

  it("新しい会話 (refresh): fetch して既定ブランチの最新へ detached で合わせる", async () => {
    const { calls, git } = recorder();
    const { repo, dir: targetDir } = cloned("existing-repo");

    const dir = await ensureChatWorkspace(dummyCfg, repo, { refresh: true }, git);

    expect(dir).toBe(targetDir);
    const idx = (pred: (a: string[]) => boolean) => calls.findIndex(pred);
    const fetch = idx((a) => a[0] === "fetch");
    const checkout = idx((a) => a.join(" ") === "checkout --detach --force origin/HEAD");
    const clean = idx((a) => a.join(" ") === "clean -fdx");
    expect(calls.some((a) => a.includes("clone"))).toBe(false);
    expect(fetch).toBeGreaterThanOrEqual(0);
    expect(checkout).toBeGreaterThan(fetch);
    expect(clean).toBeGreaterThan(checkout);
  });

  it("会話の続き: 既存のチェックアウトには一切触れない", async () => {
    const { calls, git } = recorder();
    const { repo, dir: targetDir } = cloned("continued-repo");

    const dir = await ensureChatWorkspace(dummyCfg, repo, { refresh: false }, git);

    expect(dir).toBe(targetDir);
    expect(calls).toEqual([]);
  });

  it("fetch に失敗したら古いコードのまま進めず失敗する", async () => {
    const { repo } = cloned("offline-repo");
    const git: GitRunner = async (args) =>
      args[0] === "fetch"
        ? { code: 128, stdout: "", stderr: "network down" }
        : { code: 0, stdout: "", stderr: "" };

    await expect(ensureChatWorkspace(dummyCfg, repo, { refresh: true }, git)).rejects.toThrow(
      "network down",
    );
  });
});

describe("isRepoSlug", () => {
  it("owner/name だけを受け付ける", () => {
    expect(isRepoSlug("k-wa-wa/nuage-autopilot4")).toBe(true);
    expect(isRepoSlug("owner/repo.js")).toBe(true);
    expect(isRepoSlug("../workspaces")).toBe(false);
    expect(isRepoSlug("owner/..")).toBe(false);
    expect(isRepoSlug("owner/repo/extra")).toBe(false);
    expect(isRepoSlug("owner")).toBe(false);
    expect(isRepoSlug("")).toBe(false);
  });
});
