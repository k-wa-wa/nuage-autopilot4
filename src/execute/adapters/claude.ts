import type { AgentConfig } from "../../config.ts";
import { runUsageCommand } from "./runner.ts";
import type {
  AdapterOptions,
  AgentAdapter,
  AgentUsage,
  AgentUsageLimit,
  Invocation,
} from "./types.ts";

/**
 * Claude のリセット日時文字列（例: "Aug 29 at 11:49pm (Asia/Tokyo)"）を ISO 形式に変換する。
 */
export function parseClaudeResetDate(raw: string): string | null {
  const m = raw.match(/([A-Za-z]+)\s+(\d+)\s+at\s+(\d+):(\d+)(am|pm)(?:\s*\(([^)]+)\))?/i);
  if (!m) return raw;

  const [, monStr, dayStr, hourStr, minStr, ampm, tz] = m;
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const mon = months[monStr?.toLowerCase().slice(0, 3) ?? ""];
  if (mon === undefined) return raw;

  const day = Number.parseInt(dayStr ?? "1", 10);
  let hour = Number.parseInt(hourStr ?? "0", 10);
  const min = Number.parseInt(minStr ?? "0", 10);
  if (ampm?.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (ampm?.toLowerCase() === "am" && hour === 12) hour = 0;

  const now = new Date();
  let year = now.getFullYear();
  if (mon < now.getMonth() - 6) year += 1;

  const pad = (n: number) => String(n).padStart(2, "0");
  let tzOffset = "+09:00";
  if (tz === "Asia/Tokyo" || tz === "JST") tzOffset = "+09:00";
  else if (tz === "UTC" || tz === "GMT") tzOffset = "Z";
  else {
    const offsetMin = -now.getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const absMin = Math.abs(offsetMin);
    tzOffset = `${sign}${pad(Math.floor(absMin / 60))}:${pad(absMin % 60)}`;
  }

  const date = new Date(
    `${year}-${pad(mon + 1)}-${pad(day)}T${pad(hour)}:${pad(min)}:00${tzOffset}`,
  );
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

/**
 * Claude Code の /usage コマンド出力をパースする。
 *
 * 例:
 * Current session: 63% used · resets Aug 29 at 11:49pm (Asia/Tokyo)
 * Current week (all models): 6% used · resets Sep 5 at 5:59am (Asia/Tokyo)
 */
export function parseClaudeUsage(stdout: string): AgentUsageLimit[] {
  const limits: AgentUsageLimit[] = [];

  const sessionMatch = stdout.match(
    /Current session:\s*(\d+)%\s*used(?:\s*·\s*resets\s*([^\n\r]+))?/i,
  );
  if (sessionMatch) {
    const used = Number.parseInt(sessionMatch[1]!, 10);
    const remainingPct = Math.max(0, Math.min(100, 100 - used));
    const rawReset = sessionMatch[2]?.trim();
    const resetAt = rawReset ? parseClaudeResetDate(rawReset) : null;
    limits.push({
      label: "Session",
      remainingPct,
      resetAt,
    });
  }

  const weekMatch = stdout.match(
    /Current week(?:\s*\([^)]+\))?:\s*(\d+)%\s*used(?:\s*·\s*resets\s*([^\n\r]+))?/i,
  );
  if (weekMatch) {
    const used = Number.parseInt(weekMatch[1]!, 10);
    const remainingPct = Math.max(0, Math.min(100, 100 - used));
    const rawReset = weekMatch[2]?.trim();
    const resetAt = rawReset ? parseClaudeResetDate(rawReset) : null;
    limits.push({
      label: "Weekly",
      remainingPct,
      resetAt,
    });
  }

  return limits;
}

export const claudeAdapter: AgentAdapter = {
  kind: "claude",
  buildInvocation(agent: AgentConfig, o: AdapterOptions): Invocation {
    const argv = [agent.command, "-p"];
    if (o.elevated) argv.push("--permission-mode", "bypassPermissions");
    if (agent.model) argv.push("--model", agent.model);
    return { argv, channel: "stdin" };
  },

  async fetchUsage(command: string): Promise<AgentUsage | null> {
    const res = await runUsageCommand(command, ["-p", "/usage"]);
    const updatedAt = new Date().toISOString();

    if (!res.ok) {
      return {
        adapter: "claude",
        command,
        updatedAt,
        limits: [],
        error: res.stderr.trim() || "使用量の取得に失敗しました",
      };
    }

    const limits = parseClaudeUsage(res.stdout);
    if (limits.length === 0) {
      return {
        adapter: "claude",
        command,
        updatedAt,
        limits: [],
        error: "使用量情報を解析できませんでした",
      };
    }

    return {
      adapter: "claude",
      command,
      updatedAt,
      limits,
    };
  },
};
