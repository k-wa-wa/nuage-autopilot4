import type { JobType, RunResult } from "../types.ts";
import { nowIso } from "../types.ts";
import type { DB } from "./db.ts";

export interface Run {
  id: number;
  job_id: number;
  repo: string;
  issue_number: number;
  job_type: JobType;
  started_at: string;
  ended_at: string | null;
  result: RunResult | null;
  summary: string;
  next_context: string;
  log_path: string;
}

/** ジョブ取得と同一トランザクションで作る。 */
export function startRun(
  db: DB,
  v: { job_id: number; repo: string; issue_number: number; job_type: JobType; log_path: string },
): number {
  const r = db
    .query(`
    INSERT INTO runs (job_id, repo, issue_number, job_type, started_at, result, log_path)
    VALUES (?,?,?,?,?, 'RUNNING', ?) RETURNING id
  `)
    .get(v.job_id, v.repo, v.issue_number, v.job_type, nowIso(), v.log_path) as { id: number };
  return r.id;
}

/** ジョブが終端に達したら必ず呼ぶ（孤児回収を含む）。RUNNING を残さない。 */
export function endRun(
  db: DB,
  jobId: number,
  result: RunResult,
  v?: { summary?: string; next_context?: string },
): void {
  db.query(`
    UPDATE runs SET ended_at = ?, result = ?, summary = ?, next_context = ?
    WHERE job_id = ? AND result = 'RUNNING'
  `).run(nowIso(), result, v?.summary ?? "", v?.next_context ?? "", jobId);
}

/** Triage の入力に必ず含める直近 1 件（spec.md §6）。 */
export function lastRun(db: DB, repo: string, issue: number): Run | null {
  return db
    .query("SELECT * FROM runs WHERE repo=? AND issue_number=? ORDER BY id DESC LIMIT 1")
    .get(repo, issue) as Run | null;
}
