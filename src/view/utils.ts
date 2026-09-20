/**
 * 相対時間フォーマット（例: "3分前", "2時間前", "1日前"）
 */
export function formatAgo(t: string | null): string {
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
