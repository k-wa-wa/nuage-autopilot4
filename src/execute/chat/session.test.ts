import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractUserPrompt,
  loadClaudeSession,
  parseClaudeSessionLines,
  pathToProjectSlug,
  summarizeToolArgs,
} from "./session.ts";

describe("Claude Session Parser (session.ts)", () => {
  test("summarizeToolArgs: ツール引数からサマリーを抽出できる", () => {
    expect(summarizeToolArgs({ command: "git status -s" })).toBe("git status -s");
    expect(summarizeToolArgs({ CommandLine: "gh issue list" })).toBe("gh issue list");
    expect(summarizeToolArgs({ path: "src/main.ts" })).toBe("src/main.ts");
    expect(summarizeToolArgs({ query: "error" })).toBe("error");
    expect(summarizeToolArgs({ foo: "custom-value" })).toBe("custom-value");
    expect(summarizeToolArgs(null)).toBe("");
  });

  test("extractUserPrompt: プロンプトテンプレートからユーザー本来の入力を抽出する", () => {
    const rawWithMarker = `【調査対象アイテム】
- リポジトリ: k-wa-wa/pechka
- Issue/PR 番号: #57

【Autopilot 実行環境・断面】
- バージョン: 0.1.0

【指示・質問】
どんな状況ですか？`;

    expect(extractUserPrompt(rawWithMarker)).toBe("どんな状況ですか？");

    const rawBrainstorm = `【役割・ペルソナ】
アーキテクトです。

【ユーザーの相談・メッセージ】
新機能の設計方針を相談したい`;

    expect(extractUserPrompt(rawBrainstorm)).toBe("新機能の設計方針を相談したい");

    // マーカー無しの場合はトリムした文字列がそのまま返る
    expect(extractUserPrompt("素のメッセージ")).toBe("素のメッセージ");

    // システム通知は除外される
    const notification = `<task-notification>
<task-id>xyz</task-id>
<status>stopped</status>
</task-notification>`;
    expect(extractUserPrompt(notification)).toBe("");
  });

  test("pathToProjectSlug: ディレクトリパスを Claude の slug に変換する", () => {
    expect(pathToProjectSlug("/var/lib/autopilot/chat-workspaces/k-wa-wa/pechka")).toBe(
      "-var-lib-autopilot-chat-workspaces-k-wa-wa-pechka",
    );
  });

  test("parseClaudeSessionLines: JSONL の行から会話履歴を正常に復元する", () => {
    const lines = [
      // 1. 初回のユーザー発言
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: "【調査対象アイテム】\n...\n【指示・質問】\nエラーの原因を調べて",
        },
      }),
      // 2. アシスタント思考・ツール実行
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "リポジトリの状況を確認します。" },
            {
              type: "tool_use",
              id: "tool-1",
              name: "Bash",
              input: { command: "git log -1" },
            },
          ],
        },
      }),
      // 3. ツール結果（user 行だが tool_result 配列なのでスキップされる）
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tool-1", content: "commit 123" }],
        },
      }),
      // 4. アシスタント最終回答（直前の assistant にマージされる）
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "直近のコミットは 123 です。" }],
        },
      }),
      // 5. 2回目のユーザー発言
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: "【指示・質問】\nありがとう、対処法は？",
        },
      }),
      // 6. 2回目のアシスタント回答
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "リトライしてください。" }],
        },
      }),
    ];

    const messages = parseClaudeSessionLines(lines);
    expect(messages.length).toBe(4);

    // 1通目: ユーザー
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("エラーの原因を調べて");

    // 2通目: アシスタント（マージされている）
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.content).toBe("直近のコミットは 123 です。");
    expect(messages[1]?.thinking).toBe("リポジトリの状況を確認します。");
    expect(messages[1]?.tools?.length).toBe(1);
    expect(messages[1]?.tools?.[0]?.name).toBe("Bash");
    expect(messages[1]?.tools?.[0]?.detail).toBe("git log -1");

    // 3通目: ユーザー
    expect(messages[2]?.role).toBe("user");
    expect(messages[2]?.content).toBe("ありがとう、対処法は？");

    // 4通目: アシスタント
    expect(messages[3]?.role).toBe("assistant");
    expect(messages[3]?.content).toBe("リトライしてください。");
  });

  test("loadClaudeSession: 一時ファイルから正常にセッションを読み込める", () => {
    const tmpFile = join(tmpdir(), `test-session-${Date.now()}.jsonl`);
    const content = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "【指示・質問】\nテスト発言" },
      }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "テスト返答" }] },
      }),
    ].join("\n");

    writeFileSync(tmpFile, content, "utf8");

    const messages = loadClaudeSession(tmpFile);
    expect(messages.length).toBe(2);
    expect(messages[0]?.content).toBe("テスト発言");
    expect(messages[1]?.content).toBe("テスト返答");
  });
});
