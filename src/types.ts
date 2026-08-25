// 値域の単一定義。spec.md §2 の表がここに閉じている。
// display_hint / state を増やすときはここだけを変え、コンパイラに全消費者を列挙させる。

export const STATES = ["ActionRequired", "Working", "Queued", "Done"] as const;
export type State = (typeof STATES)[number];

export const ACTION_REQUIRED_HINTS = [
  "仕様確認待ち", "マージ待ち", "助言待ち", "エラー対応待ち",
  "CI 停滞", "CI 失敗（要判断）", "Issue クローズ確認待ち", "取り下げ確認待ち",
  "完了確認待ち", "親 Issue の承認待ち", "未着手", "Triage 失敗（要判断）", "中止済み",
] as const;

export const WORKING_HINTS = [
  "精緻化中", "実装中", "評価中", "CI 待ち", "CI 未反映",
] as const;

export const QUEUED_HINTS = ["着手待ち"] as const;

/** `子タスク進行中 (x/N)` は値ではなくパターン。 */
export const SUB_PROGRESS_RE = /^子タスク進行中 \(\d+\/\d+\)$/;
export const subProgress = (done: number, total: number): DisplayHint =>
  `子タスク進行中 (${done}/${total})` as DisplayHint;

export type DisplayHint =
  | (typeof ACTION_REQUIRED_HINTS)[number]
  | (typeof WORKING_HINTS)[number]
  | (typeof QUEUED_HINTS)[number]
  | `子タスク進行中 (${number}/${number})`
  | "";

const HINT_SET: ReadonlySet<string> = new Set<string>([
  ...ACTION_REQUIRED_HINTS, ...WORKING_HINTS, ...QUEUED_HINTS,
]);

export function isDisplayHint(v: string): v is DisplayHint {
  return v === "" || HINT_SET.has(v) || SUB_PROGRESS_RE.test(v);
}

/** state と hint の組み合わせが spec.md §2 の表に一致するか。 */
export function hintMatchesState(state: State, hint: string): boolean {
  if (hint === "") return state === "Done";
  if (state === "ActionRequired") return (ACTION_REQUIRED_HINTS as readonly string[]).includes(hint);
  if (state === "Working") {
    return (WORKING_HINTS as readonly string[]).includes(hint) || SUB_PROGRESS_RE.test(hint);
  }
  if (state === "Queued") return (QUEUED_HINTS as readonly string[]).includes(hint);
  return false; // Done は hint を持たない
}

export const JOB_TYPES = ["refine", "implement", "evaluate"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["pending", "running", "completed", "failed", "canceled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
/** 終端状態。trigger_key の再投入抑止（spec.md §6）と runs の終端化に使う。 */
export const TERMINAL_STATUSES = ["completed", "failed", "canceled"] as const;

export const RUN_RESULTS = ["RUNNING", "SUCCESS", "FAIL", "BLOCKED", "TIMEOUT", "CANCELED"] as const;
export type RunResult = (typeof RUN_RESULTS)[number];

export type Verdict = "merge_ready" | "needs_work";
export type AgentStatus = "ok" | "blocked";

export interface Item {
  repo: string;
  issue_number: number;
  pr_number: number;
  branch: string;
  head_sha: string;
  title: string;
  state: State;
  display_hint: DisplayHint;
  state_since: string;
  blocked_from: JobType | "";
  last_event_at: string;
  last_event_id: number;
  retry_count: number;
  triage_fail_count: number;
  recheck_needed: number;
  ci_since: string | null;
  triaged: number;
  parent_repo: string;
  parent_issue_number: number;
  sub_issues_total: number;
  sub_issues_completed: number;
  version: number;
  updated_at: string;
}

export interface Job {
  id: number;
  repo: string;
  issue_number: number;
  job_type: JobType;
  job_context: string;
  trigger_key: string;
  status: JobStatus;
  lease_until: string | null;
  worker_pid: number | null;
  worker_boot_id: string | null;
  attempt_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/** UTC ISO8601（秒精度）。日時はすべてこの形式の TEXT で持つ。 */
export function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}
