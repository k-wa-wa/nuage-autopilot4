import { getVersionInfo } from "../cli/version.ts";
import type { AgentUsage } from "../execute/adapters/index.ts";
import type { DB } from "../store/db.ts";
import * as jobs from "../store/jobs.ts";
import type { Item } from "../types.ts";
import { nowIso } from "../types.ts";

/**
 * ④ 参照（spec.md §10）。
 *
 * items と job_queue だけを読む。github_cache.payload_json はパースしない。
 * display_hint は保存済みの文字列をそのまま返す（Dashboard 側で状態を再解釈しない）。
 */

export interface CardErrorItem {
  job_type: string | null;
  result: string | null;
  summary: string;
  occurred_at: string | null;
}

export interface JobHistoryItem {
  id: number;
  job_id: number;
  job_type: string;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  result: string | null;
  summary: string;
  next_context?: string;
}

export interface Card {
  repo: string;
  issue_number: number;
  pr_number: number;
  title: string;
  display_hint: string;
  url: string;
  issue_url: string;
  pr_url: string | null;
  state_since: string;
  queue_position: number | null;
  job_type: string | null;
  started_at: string | null;
  error_detail?: CardErrorItem | null;
  error_history?: CardErrorItem[];
  job_history?: JobHistoryItem[];
  parent_repo?: string;
  parent_issue_number?: number;
  sub_issues_total?: number;
  sub_issues_completed?: number;
  sub_issue_numbers?: number[];
}

export interface FailedJobSummary {
  id: number;
  repo: string;
  issue_number: number;
  job_type: string;
  summary: string;
  completed_at: string | null;
}

export interface Health {
  version: string;
  graphql_remaining: number;
  graphql_limit: number;
  graphql_reset_at: string | null;
  rest_remaining: number;
  rest_limit: number;
  rest_reset_at: string | null;
  agent_usages: AgentUsage[];
  running_jobs: number;
  last_poll_at: string | null;
  degraded: string[];
  failed_jobs?: FailedJobSummary[];
}

export interface StateResponse {
  generated_at: string;
  lanes: { action_required: Card[]; working: Card[]; queued: Card[]; backlog: Card[] };
  health: Health;
}

export interface DoneRepoGroup {
  repo: string;
  cards: Card[];
}

/** 完了ページ（/done）用。クローズ済み（Done）のアイテムをリポジトリごとにまとめたもの。 */
export interface DoneResponse {
  generated_at: string;
  repos: DoneRepoGroup[];
}

/** リポジトリごとの表示件数の上限。Done は終端で増え続けるので、直近のものだけを返す。 */
export const DONE_PER_REPO_LIMIT = 30;

/** プロセス内メモリ。DB に置くと、プロセスが死んでいるのに古い健全値が表示される。 */
export const runtime = {
  graphqlRemaining: 5000,
  graphqlLimit: 5000,
  graphqlResetAt: null as string | null,
  restRemaining: 5000,
  restLimit: 5000,
  restResetAt: null as string | null,
  agentUsages: [] as AgentUsage[],
  lastPollAt: null as string | null,
  degraded: new Set<string>(),
};

/**
 * Card の組み立て。実行中ジョブ・待ち順位・親子関係は 1 回だけ集計し、アイテムごとに使い回す。
 * items と job_queue / runs だけを読む（github_cache.payload_json はパースしない）。
 */
function createCardBuilder(db: DB): (it: Item) => Card {
  const running = new Map(jobs.runningJobs(db).map((j) => [key(j.repo, j.issue_number), j]));
  const pending = jobs.queuedItems(db);
  const position = new Map(pending.map((p, i) => [key(p.repo, p.issue_number), i + 1]));

  // 親Issueに紐づく子Issue番号マップの集計
  const childrenMap = new Map<string, number[]>();
  try {
    const childRows = db
      .query(
        "SELECT repo, issue_number, parent_repo, parent_issue_number FROM items WHERE parent_issue_number > 0 ORDER BY issue_number ASC",
      )
      .all() as Array<{
      repo: string;
      issue_number: number;
      parent_repo: string;
      parent_issue_number: number;
    }>;
    for (const cr of childRows) {
      const pKey = key(cr.parent_repo || cr.repo, cr.parent_issue_number);
      const list = childrenMap.get(pKey) || [];
      list.push(cr.issue_number);
      childrenMap.set(pKey, list);
    }
  } catch {
    // 例外対策
  }

  return (it: Item): Card => {
    const r = running.get(key(it.repo, it.issue_number));
    const issueUrl = `https://github.com/${it.repo}/issues/${it.issue_number}`;
    const prUrl = it.pr_number > 0 ? `https://github.com/${it.repo}/pull/${it.pr_number}` : null;

    // エラー履歴の抽出（直近の失敗 run および failed ジョブ）
    const errorHistory: CardErrorItem[] = [];
    try {
      const runErrors = db
        .query(
          "SELECT job_type, result, summary, ended_at FROM runs WHERE repo=? AND issue_number=? AND result IN ('FAIL', 'TIMEOUT', 'BLOCKED', 'CANCELED') ORDER BY id DESC LIMIT 5",
        )
        .all(it.repo, it.issue_number) as Array<{
        job_type: string;
        result: string;
        summary: string;
        ended_at: string | null;
      }>;

      for (const re of runErrors) {
        if (re.summary || re.result) {
          errorHistory.push({
            job_type: re.job_type || null,
            result: re.result || null,
            summary: re.summary || `ジョブ ${re.job_type} が ${re.result} で終了しました`,
            occurred_at: re.ended_at,
          });
        }
      }

      // job_queue の失敗レコードも確認（runs に未反映のものなど）
      const jqErrors = db
        .query(
          "SELECT job_type, job_context, completed_at FROM job_queue WHERE repo=? AND issue_number=? AND status='failed' ORDER BY id DESC LIMIT 5",
        )
        .all(it.repo, it.issue_number) as Array<{
        job_type: string;
        job_context: string;
        completed_at: string | null;
      }>;

      for (const je of jqErrors) {
        // 同一ジョブ種別・時刻の重複を避ける
        const exists = errorHistory.some(
          (h) => h.job_type === je.job_type && h.occurred_at === je.completed_at,
        );
        if (!exists) {
          errorHistory.push({
            job_type: je.job_type,
            result: "FAIL",
            summary: je.job_context ? je.job_context.slice(0, 300) : "ジョブ実行に失敗しました",
            occurred_at: je.completed_at,
          });
        }
      }
    } catch {
      // テーブルが存在しない等の例外対策
    }

    // display_hint がエラー系で履歴がない場合のフォールバック
    const isErrorHint = [
      "エラー対応待ち",
      "CI 失敗（要判断）",
      "Triage 失敗（要判断）",
      "CI 停滞",
      "助言待ち",
      "中止済み",
    ].includes(it.display_hint);

    if (isErrorHint && errorHistory.length === 0) {
      let defaultReason = `状態: ${it.display_hint}`;
      if (it.display_hint === "Triage 失敗（要判断）") {
        defaultReason = `Triage エージェントの連続失敗 (${it.triage_fail_count || 3}回試行)`;
      } else if (it.display_hint === "CI 失敗（要判断）") {
        defaultReason = `CI 修正リトライ上限超過 (${it.retry_count || 5}回試行)`;
      } else if (it.display_hint === "CI 停滞") {
        defaultReason = "CI 実行が30分以上停滞しています";
      } else if (it.display_hint === "エラー対応待ち") {
        defaultReason = "ジョブ実行中にエラーが発生しました。詳細はログを確認してください。";
      }
      errorHistory.push({
        job_type: it.blocked_from || null,
        result: "FAIL",
        summary: defaultReason,
        occurred_at: it.state_since,
      });
    }

    // ジョブ実行履歴の抽出（新しい順）
    const jobHistory: JobHistoryItem[] = [];
    try {
      const allRuns = db
        .query(
          "SELECT id, job_id, job_type, started_at, ended_at, result, summary, next_context FROM runs WHERE repo=? AND issue_number=? ORDER BY id DESC LIMIT 20",
        )
        .all(it.repo, it.issue_number) as Array<{
        id: number;
        job_id: number;
        job_type: string;
        started_at: string;
        ended_at: string | null;
        result: string | null;
        summary: string;
        next_context: string | null;
      }>;

      for (const run of allRuns) {
        let durationSec: number | null = null;
        if (run.started_at && run.ended_at) {
          const start = Date.parse(run.started_at);
          const end = Date.parse(run.ended_at);
          if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
            durationSec = Math.round((end - start) / 1000);
          }
        }
        jobHistory.push({
          id: run.id,
          job_id: run.job_id,
          job_type: run.job_type,
          started_at: run.started_at,
          ended_at: run.ended_at,
          duration_sec: durationSec,
          result: run.result,
          summary: run.summary || "",
          next_context: run.next_context || undefined,
        });
      }
    } catch {
      // 例外対策
    }

    return {
      repo: it.repo,
      issue_number: it.issue_number,
      pr_number: it.pr_number,
      title: it.title,
      display_hint: it.display_hint,
      url: prUrl ?? issueUrl,
      issue_url: issueUrl,
      pr_url: prUrl,
      state_since: it.state_since,
      queue_position: position.get(key(it.repo, it.issue_number)) ?? null,
      job_type: r?.job_type ?? null,
      started_at: r?.started_at ?? null,
      error_detail: errorHistory.length > 0 ? errorHistory[0]! : null,
      error_history: errorHistory,
      job_history: jobHistory,
      parent_repo: it.parent_repo || undefined,
      parent_issue_number: it.parent_issue_number > 0 ? it.parent_issue_number : undefined,
      sub_issues_total: it.sub_issues_total > 0 ? it.sub_issues_total : undefined,
      sub_issues_completed: it.sub_issues_total > 0 ? it.sub_issues_completed : undefined,
      sub_issue_numbers: childrenMap.get(key(it.repo, it.issue_number)),
    };
  };
}

export function buildState(db: DB): StateResponse {
  const all = db.query("SELECT * FROM items WHERE state != 'Done'").all() as Item[];
  const card = createCardBuilder(db);

  const byStateSinceDesc = (a: Card, b: Card) => b.state_since.localeCompare(a.state_since);
  const byWorkingDesc = (a: Card, b: Card) =>
    (b.started_at ?? b.state_since).localeCompare(a.started_at ?? a.state_since);

  const ar = all.filter((i) => i.state === "ActionRequired");
  return {
    generated_at: nowIso(),
    lanes: {
      // 未着手（未 Triage / allowlist 外の起票）は通常の判断待ちを埋没させるので分ける。
      action_required: ar
        .filter((i) => i.display_hint !== "未着手")
        .map(card)
        .sort(byStateSinceDesc),
      backlog: ar
        .filter((i) => i.display_hint === "未着手")
        .map(card)
        .sort(byStateSinceDesc),
      working: all
        .filter((i) => i.state === "Working")
        .map(card)
        .sort(byWorkingDesc),
      queued: all
        .filter((i) => i.state === "Queued")
        .map(card)
        .sort(byStateSinceDesc),
    },
    health: {
      version: `${getVersionInfo().version} (${getVersionInfo().commit})`,
      graphql_remaining: runtime.graphqlRemaining,
      graphql_limit: runtime.graphqlLimit,
      graphql_reset_at: runtime.graphqlResetAt,
      rest_remaining: runtime.restRemaining,
      rest_limit: runtime.restLimit,
      rest_reset_at: runtime.restResetAt,
      agent_usages: runtime.agentUsages,
      running_jobs: jobs.runningJobs(db).length,
      last_poll_at: runtime.lastPollAt,
      degraded: degraded(db),
      failed_jobs: getRecentFailedJobs(db),
    },
  };
}

/** 完了ページ用。リポジトリごとに直近 DONE_PER_REPO_LIMIT 件（新しい順）。最近完了があった repo が先頭。 */
export function buildDoneState(db: DB): DoneResponse {
  const card = createCardBuilder(db);
  const repos = db.query("SELECT DISTINCT repo FROM items WHERE state = 'Done'").all() as Array<{
    repo: string;
  }>;
  const groups = repos.map(({ repo }): DoneRepoGroup => {
    const items = db
      .query(
        "SELECT * FROM items WHERE state = 'Done' AND repo = ? ORDER BY state_since DESC LIMIT ?",
      )
      .all(repo, DONE_PER_REPO_LIMIT) as Item[];
    return { repo, cards: items.map(card) };
  });
  groups.sort((a, b) => b.cards[0]!.state_since.localeCompare(a.cards[0]!.state_since));
  return { generated_at: nowIso(), repos: groups };
}

function getRecentFailedJobs(db: DB): FailedJobSummary[] {
  try {
    const list = db
      .query(
        "SELECT id, repo, issue_number, job_type, job_context, completed_at FROM job_queue WHERE status='failed' AND completed_at >= ? ORDER BY id DESC LIMIT 10",
      )
      .all(nowIso(-60 * 60_000)) as Array<{
      id: number;
      repo: string;
      issue_number: number;
      job_type: string;
      job_context: string;
      completed_at: string | null;
    }>;

    return list.map((j) => {
      // 最初の行または要約
      const firstLine = j.job_context ? j.job_context.split("\n")[0] || "" : "エラー";
      return {
        id: j.id,
        repo: j.repo,
        issue_number: j.issue_number,
        job_type: j.job_type,
        summary: firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine,
        completed_at: j.completed_at,
      };
    });
  } catch {
    return [];
  }
}

/**
 * パイプラインが静かに止まると「Action Required 0 件」が平穏に見えてしまう。
 * 理由を積んで常時バナー表示する。
 */
function degraded(db: DB): string[] {
  const out = [...runtime.degraded];
  if (runtime.lastPollAt) {
    const behind = Date.now() - Date.parse(runtime.lastPollAt);
    if (behind > 3 * 60_000)
      out.push(`ポーリング停止（${Math.floor(behind / 60_000)} 分更新なし）`);
  }
  const failed = jobs.recentFailures(db, nowIso(-60 * 60_000));
  if (failed > 0) out.push(`ジョブ滞留（${failed} 件 failed）`);
  return out;
}

const key = (repo: string, n: number) => `${repo}#${n}`;
