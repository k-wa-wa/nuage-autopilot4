import type { DB } from "./db.ts";
import { VersionConflict } from "./db.ts";
import { nowIso, hintMatchesState } from "../types.ts";
import type { DisplayHint, Item, JobType, State } from "../types.ts";

/**
 * items の唯一の書き手（ARCHITECTURE 方針9）。
 * state / display_hint / state_since / blocked_from を直接 UPDATE してはならない。
 * すべて transitionItem() を通す。ここに不変条件が 1 回だけ書かれる。
 */

export function getItem(db: DB, repo: string, issue: number): Item | null {
  return db.query("SELECT * FROM items WHERE repo=? AND issue_number=?").get(repo, issue) as Item | null;
}

export function listByParent(db: DB, parentRepo: string, parentIssue: number): Item[] {
  return db.query("SELECT * FROM items WHERE parent_repo=? AND parent_issue_number=?")
    .all(parentRepo, parentIssue) as Item[];
}

/** Poller だけが呼ぶ。初期状態は spec.md §5 コールドスタート / §9 子 Issue に従う。 */
export function createItem(
  db: DB,
  v: { repo: string; issue_number: number; title: string; state: State; display_hint: DisplayHint;
       triaged: number; last_event_at?: string; last_event_id?: number;
       pr_number?: number; branch?: string; head_sha?: string; ci_since?: string | null;
       parent_repo?: string; parent_issue_number?: number },
): void {
  assertHint(v.state, v.display_hint);
  const t = nowIso();
  db.query(`
    INSERT INTO items (repo, issue_number, title, state, display_hint, state_since, triaged,
                       last_event_at, last_event_id, pr_number, branch, head_sha, ci_since,
                       parent_repo, parent_issue_number, version, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)
    ON CONFLICT(repo, issue_number) DO NOTHING
  `).run(v.repo, v.issue_number, v.title, v.state, v.display_hint, t, v.triaged,
         v.last_event_at ?? "", v.last_event_id ?? 0, v.pr_number ?? 0, v.branch ?? "",
         v.head_sha ?? "", v.ci_since ?? null, v.parent_repo ?? "", v.parent_issue_number ?? 0, t);
}

/**
 * Poller が持つ列だけを更新する（方針9: 列ごとに書き手は 1 つ）。
 * state / display_hint はここでは触らない。
 * ci_since は「既に NOT NULL のものだけ」head_sha 変化でリセットする（spec.md §3）。
 */
export function refreshFromGitHub(
  db: DB,
  it0: Item,
  v: { title?: string; pr_number?: number; branch?: string; head_sha?: string;
       parent_repo?: string; parent_issue_number?: number;
       sub_issues_total?: number; sub_issues_completed?: number },
): void {
  // 競合で黙って捨てると head_sha が古いまま残り、CI の HEAD 一致が永久に成立しない。
  const it = getItem(db, it0.repo, it0.issue_number) ?? it0;
  const headChanged = v.head_sha !== undefined && v.head_sha !== "" && v.head_sha !== it.head_sha;
  const resetCi = headChanged && it.ci_since !== null;
  const changed = db.query(`
    UPDATE items SET
      title = ?, pr_number = ?, branch = ?, head_sha = ?,
      parent_repo = ?, parent_issue_number = ?, sub_issues_total = ?, sub_issues_completed = ?,
      ci_since = CASE WHEN ? THEN ? ELSE ci_since END,
      version = version + 1, updated_at = ?
    WHERE repo = ? AND issue_number = ? AND version = ?
  `).run(
    v.title ?? it.title, v.pr_number ?? it.pr_number, v.branch ?? it.branch, v.head_sha ?? it.head_sha,
    v.parent_repo ?? it.parent_repo, v.parent_issue_number ?? it.parent_issue_number,
    v.sub_issues_total ?? it.sub_issues_total, v.sub_issues_completed ?? it.sub_issues_completed,
    resetCi ? 1 : 0, nowIso(), nowIso(), it.repo, it.issue_number, it.version,
  ).changes;
  if (changed === 0) {
    const fresh = getItem(db, it0.repo, it0.issue_number);
    if (fresh && fresh.version !== it.version) refreshFromGitHub(db, fresh, v);
  }
}

export interface Transition {
  state: State;
  hint: DisplayHint;
  /**
   * Done から復帰させる。reopen（強制同期）だけが立てる。
   * 既定では Done は終端であり、遅れて完了したジョブが巻き戻すのを防ぐ。
   */
  reviveFromDone?: boolean;
  /** ActionRequired へ落とすときの復帰先。助言待ち以外へ遷移するときは自動で空になる。 */
  blockedFrom?: JobType;
  retryCount?: number;
  triageFailCount?: number;
  recheckNeeded?: boolean;
  triaged?: boolean;
  /** PR 紐付けのリセット（取り下げ確認待ち）。 */
  clearPr?: boolean;
  /** ci_since を NULL から設定できるのは AgentWorker（implement 完了時）だけ。 */
  setCiSince?: string;
  clearCiSince?: boolean;
}

/**
 * items.state / display_hint の唯一の遷移点。
 * - Done は終端。ジョブ完了が Done を巻き戻すのを防ぐ（spec.md §3）。
 * - 楽観ロックは version 整数（updated_at は秒精度で ABA を検知できない）。
 */
export function transitionItem(db: DB, it: Item, t: Transition): Item {
  assertHint(t.state, t.hint);

  // Done は終端。遅れて完了したジョブが巻き戻すのを防ぐ。
  // 例外は reopen の強制同期だけで、それは明示的に reviveFromDone を立てる。
  if (it.state === "Done" && t.state !== "Done" && !t.reviveFromDone) {
    return it;
  }

  const stateChanged = it.state !== t.state;
  const blockedFrom =
    t.blockedFrom !== undefined ? t.blockedFrom
    : t.hint === "助言待ち" ? it.blocked_from
    : "";

  const changed = db.query(`
    UPDATE items SET
      state = ?, display_hint = ?,
      state_since = CASE WHEN ? THEN ? ELSE state_since END,
      blocked_from = ?,
      retry_count = ?, triage_fail_count = ?, recheck_needed = ?, triaged = ?,
      pr_number = CASE WHEN ? THEN 0 ELSE pr_number END,
      branch = CASE WHEN ? THEN '' ELSE branch END,
      head_sha = CASE WHEN ? THEN '' ELSE head_sha END,
      ci_since = CASE WHEN ? THEN NULL WHEN ? THEN ? ELSE ci_since END,
      version = version + 1, updated_at = ?
    WHERE repo = ? AND issue_number = ? AND version = ?
  `).run(
    t.state, t.hint,
    stateChanged ? 1 : 0, nowIso(),
    blockedFrom,
    t.retryCount ?? it.retry_count, t.triageFailCount ?? it.triage_fail_count,
    t.recheckNeeded === undefined ? it.recheck_needed : t.recheckNeeded ? 1 : 0,
    t.triaged === undefined ? it.triaged : t.triaged ? 1 : 0,
    t.clearPr ? 1 : 0, t.clearPr ? 1 : 0, t.clearPr ? 1 : 0,
    (t.clearPr || t.clearCiSince) ? 1 : 0, t.setCiSince ? 1 : 0, t.setCiSince ?? null,
    nowIso(), it.repo, it.issue_number, it.version,
  ).changes;

  if (changed === 0) throw new VersionConflict(it.repo, it.issue_number);
  return getItem(db, it.repo, it.issue_number)!;
}

/** 競合したら読み直して 1 度だけやり直す。 */
export function withRetry<T>(db: DB, repo: string, issue: number, fn: (it: Item) => T): T | null {
  for (let i = 0; i < 3; i++) {
    const it = getItem(db, repo, issue);
    if (!it) return null;
    try { return fn(it); } catch (e) { if (!(e instanceof VersionConflict)) throw e; }
  }
  return null;
}

export function markRecheck(db: DB, repo: string, issue: number): void {
  db.query("UPDATE items SET recheck_needed = 1, version = version + 1, updated_at = ? WHERE repo=? AND issue_number=?")
    .run(nowIso(), repo, issue);
}

export function needRecheck(db: DB): Item[] {
  return db.query("SELECT * FROM items WHERE recheck_needed = 1").all() as Item[];
}

/** CI 判定の候補。ci_since IS NOT NULL のものだけ（spec.md §4 の適用範囲）。 */
export function ciCandidates(db: DB): Item[] {
  return db.query("SELECT * FROM items WHERE ci_since IS NOT NULL AND state != 'Done' AND pr_number > 0")
    .all() as Item[];
}

export function trackedPrs(db: DB, repo: string): Item[] {
  return db.query("SELECT * FROM items WHERE repo=? AND pr_number > 0 AND state != 'Done'").all(repo) as Item[];
}

function assertHint(state: State, hint: string): void {
  if (!hintMatchesState(state, hint)) {
    throw new Error(`invalid display_hint for ${state}: ${JSON.stringify(hint)}`);
  }
}
