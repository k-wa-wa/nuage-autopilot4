import { describe, expect, test } from "bun:test";
import { agyAdapter, parseAgyUsage } from "../src/execute/adapters/agy.ts";
import {
  claudeAdapter,
  parseClaudeResetDate,
  parseClaudeUsage,
} from "../src/execute/adapters/claude.ts";
import { execAdapter } from "../src/execute/adapters/exec.ts";
import { buildInvocation, getAdapter, resolveAdapter } from "../src/execute/adapters/index.ts";

describe("adapters", () => {
  describe("resolveAdapter & getAdapter", () => {
    test("claude コマンドの解決", () => {
      expect(resolveAdapter("claude")).toBe("claude");
      expect(resolveAdapter("/usr/local/bin/claude")).toBe("claude");
      expect(getAdapter("claude")).toBe(claudeAdapter);
    });

    test("agy コマンドの解決", () => {
      expect(resolveAdapter("agy")).toBe("agy");
      expect(resolveAdapter("/Users/foo/.local/bin/agy")).toBe("agy");
      expect(getAdapter("agy")).toBe(agyAdapter);
    });

    test("その他コマンドの解決 (exec)", () => {
      expect(resolveAdapter("python")).toBe("exec");
      expect(resolveAdapter("./custom-agent.sh")).toBe("exec");
      expect(getAdapter("python")).toBe(execAdapter);
    });
  });

  describe("Claude adapter", () => {
    test("基本呼び出し", () => {
      const inv = buildInvocation(
        { command: "claude", timeout_sec: 60 },
        { promptPath: "/tmp/p.md", timeoutMs: 60_000, elevated: false },
      );
      expect(inv).toEqual({
        argv: ["claude", "-p"],
        channel: "stdin",
      });
    });

    test("model 指定と権限昇格", () => {
      const inv = buildInvocation(
        { command: "claude", model: "sonnet", timeout_sec: 120 },
        { promptPath: "/tmp/p.md", timeoutMs: 120_000, elevated: true },
      );
      expect(inv).toEqual({
        argv: ["claude", "-p", "--permission-mode", "bypassPermissions", "--model", "sonnet"],
        channel: "stdin",
      });
    });

    test("parseClaudeResetDate: 日付文字列のパース", () => {
      const resetIso = parseClaudeResetDate("Aug 29 at 11:49pm (Asia/Tokyo)");
      expect(resetIso).not.toBeNull();
      expect(resetIso).toMatch(/^\d{4}-08-29T14:49:00(\.000)?Z$/);
    });

    test("parseClaudeUsage: 正常系のパース", () => {
      const output = `
You are currently using your subscription to power your Claude Code usage

Current session: 63% used · resets Aug 29 at 11:49pm (Asia/Tokyo)
Current week (all models): 6% used · resets Sep 5 at 5:59am (Asia/Tokyo)

What's contributing to your limits usage?
      `;
      const limits = parseClaudeUsage(output);
      expect(limits).toHaveLength(2);
      expect(limits[0]!.label).toBe("Session");
      expect(limits[0]!.remainingPct).toBe(37);
      expect(limits[0]!.resetAt).toMatch(/^\d{4}-08-29T14:49:00/);

      expect(limits[1]!.label).toBe("Weekly");
      expect(limits[1]!.remainingPct).toBe(94);
      expect(limits[1]!.resetAt).toMatch(/^\d{4}-09-0/);
    });

    test("parseClaudeUsage: 100% 使用の場合", () => {
      const output = `Current session: 100% used · resets Aug 30 at 1:00am`;
      const limits = parseClaudeUsage(output);
      expect(limits).toHaveLength(1);
      expect(limits[0]!.remainingPct).toBe(0);
    });

    test("parseClaudeUsage: 空・不正出力の場合", () => {
      expect(parseClaudeUsage("")).toHaveLength(0);
      expect(parseClaudeUsage("Error: Unauthorized")).toHaveLength(0);
    });
  });

  describe("AGY adapter", () => {
    test("基本呼び出し（print-timeout 算出と file channel）", () => {
      const inv = buildInvocation(
        { command: "agy", timeout_sec: 300 },
        { promptPath: "/tmp/p.md", timeoutMs: 300_000, elevated: false },
      );
      // timeoutMs 300,000 -> 300s - 30s = 270s
      expect(inv).toEqual({
        argv: [
          "agy",
          "--print",
          "以下の指示ファイルを読み、タスクを完走せよ: /tmp/p.md",
          "--disable-slash-commands",
          "--print-timeout",
          "270",
        ],
        channel: "file",
      });
    });

    test("model 指定と権限昇格", () => {
      const inv = buildInvocation(
        { command: "agy", model: "gemini-1.5-pro", timeout_sec: 60 },
        { promptPath: "/tmp/prompt.txt", timeoutMs: 60_000, elevated: true },
      );
      // timeoutMs 60,000 -> 60s - 30s = 30s (Math.max(30, 30) = 30)
      expect(inv).toEqual({
        argv: [
          "agy",
          "--print",
          "以下の指示ファイルを読み、タスクを完走せよ: /tmp/prompt.txt",
          "--dangerously-skip-permissions",
          "--disable-slash-commands",
          "--print-timeout",
          "30",
          "--model",
          "gemini-1.5-pro",
        ],
        channel: "file",
      });
    });

    test("parseAgyUsage: TSV 出力のパース", () => {
      const output = `Gemini Models\tWeekly Limit Remaining\t85%\t2026-09-04T01:13:55Z
Gemini Models\tFive Hour Limit Remaining\t60%\t2026-08-29T14:50:37Z
Claude and GPT models\tWeekly Limit Remaining\t100%\t2026-09-05T13:31:29Z
Claude and GPT models\tFive Hour Limit Remaining\t100%\t2026-08-29T18:31:29Z`;

      const limits = parseAgyUsage(output);
      expect(limits).toHaveLength(4);
      expect(limits[0]).toEqual({
        label: "Gemini (Weekly)",
        remainingPct: 85,
        resetAt: "2026-09-04T01:13:55Z",
      });
      expect(limits[1]).toEqual({
        label: "Gemini (5h)",
        remainingPct: 60,
        resetAt: "2026-08-29T14:50:37Z",
      });
      expect(limits[2]).toEqual({
        label: "Claude/GPT (Weekly)",
        remainingPct: 100,
        resetAt: "2026-09-05T13:31:29Z",
      });
      expect(limits[3]).toEqual({
        label: "Claude/GPT (5h)",
        remainingPct: 100,
        resetAt: "2026-08-29T18:31:29Z",
      });
    });

    test("parseAgyUsage: 空・不正出力の場合", () => {
      expect(parseAgyUsage("")).toHaveLength(0);
      expect(parseAgyUsage("some error log without tsv")).toHaveLength(0);
    });
  });

  describe("Exec adapter", () => {
    test("引数付き汎用コマンドの呼び出し", () => {
      const inv = buildInvocation(
        { command: "my-agent", args: ["--flag", "value"], timeout_sec: 30 },
        { promptPath: "/tmp/p.md", timeoutMs: 30_000, elevated: false },
      );
      expect(inv).toEqual({
        argv: ["my-agent", "--flag", "value"],
        channel: "stdin",
      });
    });
  });
});
