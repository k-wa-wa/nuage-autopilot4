import { DEFAULTS } from "../config.ts";
import type { Item } from "../types.ts";
import type { PrDetail } from "../github/detail.ts";
import { headOid, rollupState } from "../github/detail.ts";

/**
 * CI 判定の唯一の場所（spec.md §4）。
 *
 * 呼び出し側から分岐を奪う。ここに書かれていない CI の解釈をどこかで足すと、
 * 「A で宣言した規則が B で強制されない」形の欠陥がまた生まれる。
 *
 * 適用範囲: items.ci_since IS NOT NULL のアイテムのみ。
 *   ci_since を NULL から設定できるのは AgentWorker（implement 完了時）だけであり、
 *   コールドスタートでシードした既存 PR（人間が作ったもの）は対象外になる。
 */

export type CiAction =
  | { kind: "skip"; reason: string }
  | { kind: "wait"; hint: "CI 待ち" | "CI 未反映" }
  | { kind: "evaluate"; triggerKey: string }
  | { kind: "reimplement"; triggerKey: string; reason: string }
  | { kind: "escalate"; hint: "CI 停滞" | "CI 失敗（要判断）" };

export function decideCiAction(item: Item, pr: PrDetail | null, now = Date.now()): CiAction {
  // 適用範囲の限定。Autopilot 自身が作った PR だけを判定対象にする。
  if (item.ci_since === null) return { kind: "skip", reason: "ci_since is null (not ours)" };
  if (!pr) return { kind: "skip", reason: "no pr" };
  if (pr.state !== "OPEN") return { kind: "skip", reason: `pr is ${pr.state}` };

  // 人間が作業中の Draft は触らない。エージェントには draft 作成を禁止している。
  if (pr.isDraft) return { kind: "skip", reason: "draft" };

  // HEAD 一致の検証。3 者が揃わなければ別コミットの結果なので待つ。
  const oid = headOid(pr);
  if (oid === "" || oid !== pr.headRefOid || oid !== item.head_sha) {
    return { kind: "wait", hint: "CI 未反映" };
  }

  const elapsed = now - Date.parse(item.ci_since);
  const rollup = rollupState(pr);

  switch (rollup) {
    case "SUCCESS":
      return { kind: "evaluate", triggerKey: `ci:${oid}:SUCCESS` };

    case "FAILURE":
    case "ERROR":
      if (item.retry_count < DEFAULTS.retryLimit) {
        return { kind: "reimplement", triggerKey: `ci:${oid}:FAILURE`, reason: "CI failed" };
      }
      return { kind: "escalate", hint: "CI 失敗（要判断）" };

    case "PENDING":
    case "EXPECTED":
      return elapsed >= DEFAULTS.ciStallMs
        ? { kind: "escalate", hint: "CI 停滞" }
        : { kind: "wait", hint: "CI 待ち" };

    case null:
      // workflow 未登録の猶予。経過後は「CI 未設定リポジトリ」として成功扱い。
      return elapsed >= DEFAULTS.ciGraceMs
        ? { kind: "evaluate", triggerKey: `ci:${oid}:NO_CI` }
        : { kind: "wait", hint: "CI 待ち" };

    default:
      return { kind: "wait", hint: "CI 待ち" };
  }
}

/** trigger_key から対象 SHA を取り出す。evaluate の実行前 HEAD 検証に使う。 */
export function shaFromTriggerKey(key: string): string | null {
  const m = /^ci:([0-9a-f]{7,40}):(SUCCESS|FAILURE|NO_CI)$/.exec(key);
  return m?.[1] ?? null;
}
