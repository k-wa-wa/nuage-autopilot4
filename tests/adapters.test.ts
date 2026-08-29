import { describe, expect, test } from "bun:test";
import {
  agyAdapter,
  buildInvocation,
  claudeAdapter,
  execAdapter,
  getAdapter,
  resolveAdapter,
} from "../src/execute/adapters/index.ts";

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
