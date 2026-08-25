import type { DB } from "./db.ts";
import { nowIso } from "../types.ts";
import type { Job, JobType } from "../types.ts";

/**
 * job_queue の唯一の入口（ARCHITECTURE 方針9）。
 * 投入・取得・リース・回収・中止はすべてここを通す。
 */

/**
 * ジョブ投入。二重投入は 2 段で防ぐ（spec.md §6）。
 *   1. idx_job_dedupe … 同一アイテムに同種の未完了ジョブがある間は INSERT 失敗
 *   2. trigger_key   … 同じ発火元で終端に達したジョブがあれば投入しない
 * INSERT 失敗は正常系。既存ジョブの job_context に追記してマージする。
 * @returns 投入した job_id。抑止されたら null。
 */
export function enqueueJob(
  db: DB,
  v: { repo: string; issue_number: number; job_type: JobType; job_context: string; trigger_key: string },
): number | null {
  const done = db.query(`
    SELECT 1 FROM job_queue
    WHERE repo=? AND issue_number=? AND trigger_key=? AND status IN ('completed','failed','canceled') LIMIT 1
  `).get(v.repo, v.issue_number, v.trigger_key);
  if (done) return null;

  const ctx = clampContext(v.job_context);
  try {
    const r = db.query(`
      INSERT INTO job_queue (repo, issue_number, job_type, job_context, trigger_key, status, created_at)
      VALUES (?,?,?,?,?, 'pending', ?)
      RETURNING id
    `).get(v.repo, v.issue_number, v.job_type, ctx, v.trigger_key, nowIso()) as { id: number };
    return r.id;
  } catch (e) {
    // idx_job_dedupe 違反 = 同種の未完了ジョブが既にある。文脈をマージして正常終了。
    if (!String(e).includes("UNIQUE")) throw e;
    const cur = db.query(`
      SELECT id, job_context FROM job_queue
      WHERE repo=? AND issue_number=? AND job_type=? AND status IN ('pending','running')
    `).get(v.repo, v.issue_number, v.job_type) as { id: number; job_context: string } | null;
    if (cur) {
      db.query("UPDATE job_queue SET job_context=? WHERE id=?")
        .run(clampContext(cur.job_context + "\n\n---\n\n" + ctx), cur.id);
    }
    return null;
  }
}

export const MAX_CONTEXT = 60_000;
/** 60,000 文字上限。超過分は古い側から捨てる（spec.md §6）。 */
export function clampContext(s: string): string {
  return s.length <= MAX_CONTEXT ? s : "…（省略）\n" + s.slice(s.length - MAX_CONTEXT);
}

/**
 * リポジトリ横断 FIFO の排他フェッチ。単一文で取得と更新を行う（TOCTOU 回避）。
 * 同一リポジトリの直列化と max_parallel を 1 文で同時に満たす。
 */
export function fetchNextJob(db: DB, maxParallel: number, pid: number, bootId: string): Job | null {
  return db.query(`
    UPDATE job_queue
    SET status='running', lease_until=?, started_at=?, worker_pid=?, worker_boot_id=?
    WHERE id = (
      SELECT id FROM job_queue q
      WHERE q.status = 'pending'
        AND (SELECT COUNT(*) FROM job_queue WHERE status='running') < ?
        AND NOT EXISTS (SELECT 1 FROM job_queue r WHERE r.repo = q.repo AND r.status = 'running')
      ORDER BY q.id ASC LIMIT 1
    )
    RETURNING *
  `).get(nowIso(5 * 60_000), nowIso(), pid, bootId, maxParallel) as Job | null;
}

/** 生存信号。実行タイムアウトとは別物。60 秒ごとに +5 分。 */
export function heartbeat(db: DB, id: number, pid: number, bootId: string): boolean {
  return db.query(`
    UPDATE job_queue SET lease_until = ?
    WHERE id = ? AND status = 'running' AND worker_pid = ? AND worker_boot_id = ?
  `).run(nowIso(5 * 60_000), id, pid, bootId).changes > 0;
}

export function getJob(db: DB, id: number): Job | null {
  return db.query("SELECT * FROM job_queue WHERE id=?").get(id) as Job | null;
}

export function hasActiveJob(db: DB, repo: string, issue: number): boolean {
  return !!db.query(`
    SELECT 1 FROM job_queue WHERE repo=? AND issue_number=? AND status IN ('pending','running') LIMIT 1
  `).get(repo, issue);
}

export function finishJob(db: DB, id: number, status: "completed" | "failed" | "canceled"): void {
  db.query("UPDATE job_queue SET status=?, completed_at=?, lease_until=NULL WHERE id=?")
    .run(status, nowIso(), id);
}

/** 強制同期が Done を確定したとき等、当該アイテムの未完了ジョブを止める（spec.md §3）。 */
export function cancelJobsFor(db: DB, repo: string, issue: number, jobType?: JobType): number {
  const q = jobType
    ? db.query("UPDATE job_queue SET status='canceled', completed_at=? WHERE repo=? AND issue_number=? AND job_type=? AND status IN ('pending','running')")
    : db.query("UPDATE job_queue SET status='canceled', completed_at=? WHERE repo=? AND issue_number=? AND status IN ('pending','running')");
  return jobType
    ? q.run(nowIso(), repo, issue, jobType).changes
    : q.run(nowIso(), repo, issue).changes;
}

/**
 * 孤児回収。起動時の running は全て前回プロセスの残骸。
 * lease_until 失効も同様（ハートビートが生きていれば成立しない）。
 * attempt_count >= 2 で failed に確定させ、無限再実行を防ぐ。
 */
export function recoverOrphans(db: DB, opts: { onStartup: boolean }): Job[] {
  const where = opts.onStartup ? "status='running'" : "status='running' AND lease_until < ?";
  const args = opts.onStartup ? [] : [nowIso()];
  const orphans = db.query(`SELECT * FROM job_queue WHERE ${where}`).all(...args) as Job[];
  if (orphans.length === 0) return [];
  db.query(`
    UPDATE job_queue
    SET status = CASE WHEN attempt_count >= 2 THEN 'failed' ELSE 'pending' END,
        attempt_count = attempt_count + 1,
        lease_until = NULL, worker_pid = NULL, worker_boot_id = NULL
    WHERE ${where}
  `).run(...args);
  return orphans;
}

export function queuedItems(db: DB): Array<{ repo: string; issue_number: number; id: number }> {
  return db.query("SELECT repo, issue_number, id FROM job_queue WHERE status='pending' ORDER BY id ASC")
    .all() as Array<{ repo: string; issue_number: number; id: number }>;
}

export function runningJobs(db: DB): Job[] {
  return db.query("SELECT * FROM job_queue WHERE status='running'").all() as Job[];
}

export function recentFailures(db: DB, sinceIso: string): number {
  return (db.query("SELECT COUNT(*) n FROM job_queue WHERE status='failed' AND completed_at >= ?")
    .get(sinceIso) as { n: number }).n;
}
