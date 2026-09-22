import type { Card } from "../api/state.ts";

export function cardKeyOf(c: Pick<Card, "repo" | "issue_number">): string {
  return `${c.repo}#${c.issue_number}`;
}

export function parentKeyOf(c: Card): string | null {
  return c.parent_issue_number ? `${c.parent_repo || c.repo}#${c.parent_issue_number}` : null;
}

/**
 * 相対時間フォーマット（例: "3分前", "2時間前", "1日前"）
 */
export function formatAgo(t: string | null | undefined): string {
  if (!t) return "";
  const diffMs = Date.now() - Date.parse(t);
  if (Number.isNaN(diffMs)) return "";
  const m = Math.floor(diffMs / 60000);
  return m < 1
    ? "たった今"
    : m < 60
      ? `${m}分前`
      : m < 1440
        ? `${Math.floor(m / 60)}時間前`
        : `${Math.floor(m / 1440)}日前`;
}

/**
 * 実行所要時間フォーマット（例: "45秒", "5分36秒"）
 */
export function formatDuration(sec: number | null): string {
  if (sec == null) return "--";
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}分${s}秒` : `${m}分`;
}

export function formatPollTime(iso: string | null): string {
  return iso ? formatAgo(iso) : "未実行";
}

// エージェント CLI は ISO 以外に "resets Jan 5, 3pm (Asia/Tokyo)" のような表記を返す
export function parseResetMs(str: string): number {
  const ms = Date.parse(str);
  if (!Number.isNaN(ms)) return ms;

  const m = str.match(
    /(?:resets\s+)?([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(?:at)?\s*|\s+)(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)(?:\s*\(([^)]+)\))?/i,
  );
  if (!m) return Number.NaN;

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
  if (mon === undefined) return Number.NaN;

  const day = Number.parseInt(dayStr ?? "1", 10);
  let hour = Number.parseInt(hourStr ?? "0", 10);
  const min = minStr ? Number.parseInt(minStr, 10) : 0;
  if (ampm?.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (ampm?.toLowerCase() === "am" && hour === 12) hour = 0;

  const now = new Date();
  let year = now.getFullYear();
  if (mon < now.getMonth() - 6) year += 1;

  const pad = (n: number) => String(n).padStart(2, "0");
  const tzOffset = tz === "UTC" || tz === "GMT" ? "Z" : "+09:00";
  const d = new Date(`${year}-${pad(mon + 1)}-${pad(day)}T${pad(hour)}:${pad(min)}:00${tzOffset}`);
  return d.getTime();
}

export function formatReset(iso: string | null): string {
  if (!iso) return "--";
  const resetMs = parseResetMs(iso);
  if (Number.isNaN(resetMs)) return iso;
  const diffMin = Math.round((resetMs - Date.now()) / 60000);
  if (diffMin <= 0) return "まもなくリセット";
  if (diffMin < 60) return `あと${diffMin}分`;
  if (diffMin < 1440) {
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return mins === 0 ? `あと${hours}時間` : `あと${hours}時間${mins}分`;
  }
  const days = Math.floor(diffMin / 1440);
  const remHours = Math.floor((diffMin % 1440) / 60);
  return remHours === 0 ? `あと${days}日` : `あと${days}日${remHours}時間`;
}

/**
 * エラー系 display_hint の判定
 */
export const ERROR_HINTS = [
  "エラー対応待ち",
  "CI 失敗（要判断）",
  "Triage 失敗（要判断）",
  "CI 停滞",
  "助言待ち",
  "中止済み",
] as const;

export function isErrorHint(displayHint: string): boolean {
  return (ERROR_HINTS as readonly string[]).includes(displayHint);
}
