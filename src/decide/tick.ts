import * as items from "../store/items.ts";
import * as cache from "../store/cache.ts";
import type { DispatchDeps } from "./dispatcher.ts";
import { dispatch } from "./dispatcher.ts";
import { decideCiAction } from "./ci.ts";
import type { PrDetail } from "../github/detail.ts";

/**
 * Tick（spec.md §5）。
 *
 * ポーリングは「GitHub 側が変化したこと」しか検知できない。
 * statusCheckRollup が null / PENDING のまま固まると fingerprint も payload_hash も動かず、
 * Grace Period も待機上限も永久に発火しない。時間だけを見るループが要る。
 *
 * GitHub API は呼ばない。CI 時間切れ判定は機械的規則のみ。
 * ただし recheck_needed の再評価は通常の Triage パイプラインに合流するため LLM を呼びうる。
 */
export async function tick(d: DispatchDeps): Promise<{ rechecked: number; ciMoved: number }> {
  let rechecked = 0;
  let ciMoved = 0;

  // 保留していた Triage を最優先で再評価する。
  for (const it of items.needRecheck(d.db)) {
    d.db.query("UPDATE items SET recheck_needed = 0 WHERE repo=? AND issue_number=?")
      .run(it.repo, it.issue_number);
    await dispatch(d, it.repo, it.issue_number);
    rechecked++;
  }

  // 時間経過だけで動く CI 判定（Grace Period 経過 / PENDING の停滞）。
  for (const it of items.ciCandidates(d.db)) {
    const pr = cache.payload<PrDetail>(d.db, it.repo, "pull_request", it.pr_number);
    const action = decideCiAction(it, pr);
    if (action.kind !== "evaluate" && action.kind !== "escalate") continue;
    await dispatch(d, it.repo, it.issue_number);
    ciMoved++;
  }

  return { rechecked, ciMoved };
}
