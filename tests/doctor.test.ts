import { describe, expect, test } from "bun:test";
import type { Check } from "../src/cli/doctor.ts";
import { printChecks } from "../src/cli/doctor.ts";

describe("doctor printChecks", () => {
  test("全件 ok の場合 true を返し、サマリーに正常件数が表示される", () => {
    const checks: Check[] = [
      {
        category: "GitHub 認証・アカウント",
        name: "bot account",
        level: "ok",
        detail: "@autopilot-bot",
      },
      {
        category: "実行環境・CLI ツール",
        name: "agent:triage",
        level: "ok",
        detail: "claude (claude)",
      },
      { category: "実行環境・CLI ツール", name: "bin:git", level: "ok", detail: "found (v2.44.0)" },
    ];
    const ok = printChecks(checks);
    expect(ok).toBe(true);
  });

  test("warn を含む場合でも fatal が無ければ true を返す", () => {
    const checks: Check[] = [
      {
        category: "GitHub 認証・アカウント",
        name: "bot account",
        level: "ok",
        detail: "@autopilot-bot",
      },
      { category: "リポジトリ: owner/repo", name: "visibility", level: "warn", detail: "public" },
    ];
    const ok = printChecks(checks);
    expect(ok).toBe(true);
  });

  test("fatal を含む場合は false を返す", () => {
    const checks: Check[] = [
      {
        category: "GitHub 認証・アカウント",
        name: "bot account",
        level: "fatal",
        detail: "viewer 取得失敗",
      },
    ];
    const ok = printChecks(checks);
    expect(ok).toBe(false);
  });
});
