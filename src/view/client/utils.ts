/**
 * クライアント側ユーティリティ関数群
 */

export const ago = (t: string | null): string => {
  if (!t) return "";
  const m = Math.floor((Date.now() - Date.parse(t)) / 60000);
  return m < 1
    ? "たった今"
    : m < 60
      ? `${m}分前`
      : m < 1440
        ? `${Math.floor(m / 60)}時間前`
        : `${Math.floor(m / 1440)}日前`;
};

export const parseResetMs = (str: string): number => {
  const ms = Date.parse(str);
  if (!Number.isNaN(ms)) return ms;

  const m = str.match(
    /(?:resets\s+)?([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(?:at)?\s*|\s+)(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)(?:\s*\(([^)]+)\))?/i,
  );
  if (m) {
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
    if (mon !== undefined) {
      const day = Number.parseInt(dayStr ?? "1", 10);
      let hour = Number.parseInt(hourStr ?? "0", 10);
      const min = minStr ? Number.parseInt(minStr, 10) : 0;
      if (ampm?.toLowerCase() === "pm" && hour < 12) hour += 12;
      if (ampm?.toLowerCase() === "am" && hour === 12) hour = 0;

      const now = new Date();
      let year = now.getFullYear();
      if (mon < now.getMonth() - 6) year += 1;

      const pad = (n: number) => String(n).padStart(2, "0");
      let tzOffset = "+09:00";
      if (tz === "Asia/Tokyo" || tz === "JST") tzOffset = "+09:00";
      else if (tz === "UTC" || tz === "GMT") tzOffset = "Z";

      const d = new Date(
        `${year}-${pad(mon + 1)}-${pad(day)}T${pad(hour)}:${pad(min)}:00${tzOffset}`,
      );
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
  }
  return Number.NaN;
};

export const formatReset = (iso: string | null): string => {
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
};

export const formatPollTime = (iso: string | null): string => (iso ? ago(iso) : "未実行");

export const esc = (s: unknown): string =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c,
  );
