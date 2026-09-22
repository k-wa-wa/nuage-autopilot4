import { describe, expect, test } from "bun:test";
import { agyAdapter, parseAgyUsage } from "./agy.ts";
import { claudeAdapter, parseClaudeResetDate, parseClaudeUsage } from "./claude.ts";
import { execAdapter } from "./exec.ts";
import { buildChatInvocation, buildInvocation, getAdapter, resolveAdapter } from "./index.ts";

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

      // カンマ区切り形式 (Sep 21, 3:50am)
      const commaIso = parseClaudeResetDate("Sep 21, 3:50am (Asia/Tokyo)");
      expect(commaIso).not.toBeNull();
      expect(commaIso).toMatch(/^\d{4}-09-20T18:50:00(\.000)?Z$/);

      // 分省略形式 (Sep 26, 6am)
      const noMinIso = parseClaudeResetDate("Sep 26, 6am (Asia/Tokyo)");
      expect(noMinIso).not.toBeNull();
      expect(noMinIso).toMatch(/^\d{4}-09-25T21:00:00(\.000)?Z$/);
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
      expect(inv.argv[0]).toBe("agy");
      expect(inv.argv[1]).toBe("--print");
      expect(inv.argv[2]).toContain("以下の指示ファイルを読み、タスクを完走せよ: /tmp/p.md");
      expect(inv.argv[2]).toContain("結果JSONファイル");
      expect(inv.argv.slice(3)).toEqual(["--disable-slash-commands", "--print-timeout", "270s"]);
      expect(inv.channel).toBe("file");
    });

    test("model 指定と権限昇格", () => {
      const inv = buildInvocation(
        { command: "agy", model: "gemini-1.5-pro", timeout_sec: 60 },
        { promptPath: "/tmp/prompt.txt", timeoutMs: 60_000, elevated: true },
      );
      // timeoutMs 60,000 -> 60s - 30s = 30s (Math.max(30, 30) = 30)
      expect(inv.argv[0]).toBe("agy");
      expect(inv.argv[1]).toBe("--print");
      expect(inv.argv[2]).toContain("以下の指示ファイルを読み、タスクを完走せよ: /tmp/prompt.txt");
      expect(inv.argv.slice(3)).toEqual([
        "--dangerously-skip-permissions",
        "--disable-slash-commands",
        "--print-timeout",
        "30s",
        "--model",
        "gemini-1.5-pro",
      ]);
      expect(inv.channel).toBe("file");
    });

    test("parseAgyUsage: TSV 出力のパース（既定では Claude/GPT 枠は除外）", () => {
      const output = `Gemini Models\tWeekly Limit Remaining\t85%\t2026-09-04T01:13:55Z
Gemini Models\tFive Hour Limit Remaining\t60%\t2026-08-29T14:50:37Z
Claude and GPT models\tWeekly Limit Remaining\t100%\t2026-09-05T13:31:29Z
Claude and GPT models\tFive Hour Limit Remaining\t100%\t2026-08-29T18:31:29Z`;

      const limits = parseAgyUsage(output);
      expect(limits).toHaveLength(2);
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

      // includeClaudeGpt: true の場合は全件含まれる
      const allLimits = parseAgyUsage(output, { includeClaudeGpt: true });
      expect(allLimits).toHaveLength(4);
      expect(allLimits[2]).toEqual({
        label: "Claude/GPT (Weekly)",
        remainingPct: 100,
        resetAt: "2026-09-05T13:31:29Z",
      });
      expect(allLimits[3]).toEqual({
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

  describe("Chat invocation (investigate.ts 用)", () => {
    test("claude: 新規会話", () => {
      const inv = buildChatInvocation({ command: "claude", timeout_sec: 0 }, { prompt: "hi" });
      expect(inv).toEqual({
        argv: [
          "claude",
          "-p",
          "hi",
          "--output-format",
          "stream-json",
          "--verbose",
          "--include-partial-messages",
          "--permission-mode",
          "bypassPermissions",
        ],
      });
    });

    test("claude: 会話継続時は --resume を付与", () => {
      const inv = buildChatInvocation(
        { command: "claude", timeout_sec: 0 },
        { prompt: "続き", conversationId: "conv-1" },
      );
      expect(inv.argv).toContain("--resume");
      expect(inv.argv.at(-1)).toBe("conv-1");
    });

    test("agy: 新規会話", () => {
      const inv = buildChatInvocation({ command: "agy", timeout_sec: 0 }, { prompt: "hi" });
      expect(inv).toEqual({
        argv: [
          "agy",
          "-p",
          "hi",
          "--output-format",
          "stream-json",
          "--dangerously-skip-permissions",
        ],
      });
    });

    test("agy: 会話継続時は --conversation を付与", () => {
      const inv = buildChatInvocation(
        { command: "agy", timeout_sec: 0 },
        { prompt: "続き", conversationId: "conv-2" },
      );
      expect(inv.argv).toContain("--conversation");
      expect(inv.argv.at(-1)).toBe("conv-2");
    });

    test("exec アダプタは Chat 呼び出し未対応でエラー", () => {
      expect(() =>
        buildChatInvocation({ command: "my-agent", timeout_sec: 0 }, { prompt: "hi" }),
      ).toThrow();
    });
  });
});
