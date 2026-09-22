import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import type { Config } from "../config.ts";
import { goldenIn } from "../testing/golden.ts";
import type { AutopilotEnvironment, CardContext } from "./chat.ts";
import { buildInvestigatePrompt, prepareChatWorkspace } from "./chat.ts";
import type { GitRunner } from "./workspace.ts";

const golden = goldenIn(import.meta.url);

const fixedEnv: AutopilotEnvironment = {
  version: "0.1.0",
  commit: "a1b2c3d",
  sourceDir: "/Users/test/nuage-autopilot4",
};

describe("Agent Investigation Logic Golden Tests (execute/chat.ts)", () => {
  it("investigate: エラー詳細ありカードとユーザー質問のプロンプト", () => {
    const card: CardContext = {
      repo: "k-wa-wa/pechka",
      issue_number: 42,
      title: "OAuth認証のコールバック処理でトークン検証が失敗する",
      display_hint: "リトライ上限 (5/5)",
      state_lane: "action_required",
      error_detail: {
        summary: "OAuth token invalid: 401 Unauthorized",
        detail:
          "Error: token expired at 2026-09-22T04:00:00Z\n  at verifyToken (auth.ts:45)\n  at handleCallback (route.ts:12)",
      },
    };

    const prompt = buildInvestigatePrompt({
      card,
      userMessage:
        "リトライ上限に達して止まっている原因と、Autopilot側の判定仕様を教えてください。",
      env: fixedEnv,
    });

    golden("investigate_error_with_user_message", prompt);
  });

  it("investigate: 正常稼働中カードでユーザー指示なし（デフォルト調査文）のプロンプト", () => {
    const card: CardContext = {
      repo: "k-wa-wa/nuage-cluster",
      issue_number: 101,
      title: "Talos OS のワーカーノード追加",
      display_hint: "CI待ち (2/3)",
      state_lane: "working",
    };

    const prompt = buildInvestigatePrompt({
      card,
      env: fixedEnv,
    });

    golden("investigate_working_default_prompt", prompt);
  });

  it("investigate: カード未指定でシステム全体に関する質問プロンプト", () => {
    const prompt = buildInvestigatePrompt({
      userMessage: "現在キューに入っているタスクとレートリミットの状況を要約して",
      env: fixedEnv,
    });

    golden("investigate_general_system_prompt", prompt);
  });

  it("investigate: ソースディレクトリ未配置（単一バイナリ配布時）のフォールバックプロンプト", () => {
    const prompt = buildInvestigatePrompt({
      userMessage: "エラー原因を調査して",
      env: {
        version: "0.1.0",
        commit: "a1b2c3d",
        sourceDir: "",
      },
    });

    golden("investigate_no_source_dir_fallback", prompt);
  });

  it("brainstorm: 壁打ちモードでカード指定ありのプロンプト", () => {
    const card: CardContext = {
      repo: "k-wa-wa/pechka",
      issue_number: 55,
      title: "WebSocket 接続の切断検知と再接続バックオフの実装",
      state_lane: "backlog",
      display_hint: "要件確認中",
    };

    const prompt = buildInvestigatePrompt({
      card,
      userMessage:
        "Exponential Backoff の再接続ロジックをクラス構造でどのように設計すべきか相談したい",
      env: fixedEnv,
      mode: "brainstorm",
    });

    golden("brainstorm_with_card_prompt", prompt);
    expect(prompt).toContain("要件壁打ち・設計相談アーキテクト");
    expect(prompt).toContain("k-wa-wa/pechka");
    expect(prompt).toContain("gh issue create -R k-wa-wa/pechka");
    expect(prompt).toContain("確認を得ずに起票してはいけません");
  });

  it("brainstorm: 壁打ちモードでカード未指定（全般的な設計相談）のプロンプト", () => {
    const prompt = buildInvestigatePrompt({
      userMessage: "新しく GitHub Issue 駆動で自動実行する CLI ツールを作りたい",
      env: fixedEnv,
      mode: "brainstorm",
    });

    golden("brainstorm_general_prompt", prompt);
    expect(prompt).toContain("要件壁打ち・設計相談アーキテクト");
    expect(prompt).not.toContain("【関連コンテキスト (Issue/PR)】");
    expect(prompt).toContain("gh issue create -R <owner/repo>");
  });
});

describe("Agent Investigation Utilities (execute/chat.ts)", () => {
  const cfg = { home: `/tmp/mock-autopilot-${Date.now()}` } as unknown as Config;
  const recordingGit = (cwds: string[]): GitRunner => {
    return async (_args, cwd) => {
      cwds.push(cwd);
      return { code: 0, stdout: "", stderr: "" };
    };
  };

  it("prepareChatWorkspace は chat-workspaces だけを使い、workspaces には触れない", async () => {
    const cwds: string[] = [];
    const dir = await prepareChatWorkspace(
      "k-wa-wa/test-repo",
      cfg,
      true,
      undefined,
      recordingGit(cwds),
    );

    expect(dir).toBe(join(cfg.home, "chat-workspaces", "k-wa-wa/test-repo"));
    expect(cwds.every((c) => !c.startsWith(join(cfg.home, "workspaces")))).toBe(true);
  });

  it("prepareChatWorkspace は設定が無ければフォールバックせず失敗する", async () => {
    await expect(prepareChatWorkspace("k-wa-wa/test-repo", undefined, true)).rejects.toThrow();
  });

  it("prepareChatWorkspace は repo でメインワーカーのワークスペースを指させない", async () => {
    const cwds: string[] = [];
    await expect(
      prepareChatWorkspace("../workspaces/k-wa-wa", cfg, true, undefined, recordingGit(cwds)),
    ).rejects.toThrow("invalid repo");
    expect(cwds).toEqual([]);
  });
});
