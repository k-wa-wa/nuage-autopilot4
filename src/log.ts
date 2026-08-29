import type { Logger } from "./types.ts";
import { nowIso } from "./types.ts";

/**
 * 標準ログ（docs/logging.md）。
 * フォーマット: `YYYY-MM-DDTHH:mm:ssZ [LEVEL] [repo#issue:] MESSAGE`
 * error はプロセス停止・即座の人間介入が必要な致命的異常だけに使い、stderr へ出す。
 */
export const log: Logger = (level, msg) => {
  const line = `${nowIso()} [${level}] ${msg}`;
  if (level === "error") console.error(line);
  else console.log(line);
};
