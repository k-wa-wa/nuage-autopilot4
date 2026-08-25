import type { Item } from "../types.ts";

/**
 * FastPass（spec.md §6）。最頻出の「OK」を LLM 消費 0 で通す。
 *
 * 状態ガードが無いと、マージ待ちの PR に付けた「OK」や完了報告への「ありがとう、OK」が
 * implement を起動して完成済みのブランチを壊す。
 * 子ガードが無いと、親への「OK」（＝子のファンアウトを意味する）で親自身に implement が積まれる。
 */

export const APPROVE_RE = /^(ok|了解|承認|進めて|お願いします|やって|go)[。！!.]*$/iu;

export function isApproval(body: string): boolean {
  return APPROVE_RE.test(body.trim());
}

export function fastPassApplies(item: Item, body: string): boolean {
  return (
    isApproval(body) &&
    item.state === "ActionRequired" &&
    item.display_hint === "仕様確認待ち" &&
    item.sub_issues_total === 0
  );
}
