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

export interface Card {
  repo: string;
  issue_number: number;
  pr_number: number;
  title: string;
  display_hint: string;
  url: string;
  state_since: string;
  queue_position: number | null;
  job_type: string | null;
  started_at: string | null;
}

export interface Health {
  graphql_remaining: number;
  graphql_limit: number;
  graphql_reset_at: string | null;
  rest_remaining: number;
  rest_limit: number;
  rest_reset_at: string | null;
  running_jobs: number;
  last_poll_at: string | null;
  degraded: string[];
}

export interface StateResponse {
  generated_at: string;
  lanes: { action_required: Card[]; working: Card[]; queued: Card[]; backlog: Card[] };
  health: Health;
}

/** プロセス内メモリ。DB に置くと、プロセスが死んでいるのに古い健全値が表示される。 */
export const runtime = {
  graphqlRemaining: 5000,
  graphqlLimit: 5000,
  graphqlResetAt: null as string | null,
  restRemaining: 5000,
  restLimit: 5000,
  restResetAt: null as string | null,
  lastPollAt: null as string | null,
  degraded: new Set<string>(),
};

export function buildState(db: DB): StateResponse {
  const all = db.query("SELECT * FROM items WHERE state != 'Done'").all() as Item[];
  const running = new Map(jobs.runningJobs(db).map((j) => [key(j.repo, j.issue_number), j]));
  const pending = jobs.queuedItems(db);
  const position = new Map(pending.map((p, i) => [key(p.repo, p.issue_number), i + 1]));

  const card = (it: Item): Card => {
    const r = running.get(key(it.repo, it.issue_number));
    return {
      repo: it.repo,
      issue_number: it.issue_number,
      pr_number: it.pr_number,
      title: it.title,
      display_hint: it.display_hint,
      url: it.pr_number > 0
        ? `https://github.com/${it.repo}/pull/${it.pr_number}`
        : `https://github.com/${it.repo}/issues/${it.issue_number}`,
      state_since: it.state_since,
      queue_position: position.get(key(it.repo, it.issue_number)) ?? null,
      job_type: r?.job_type ?? null,
      started_at: r?.started_at ?? null,
    };
  };

  const ar = all.filter((i) => i.state === "ActionRequired");
  return {
    generated_at: nowIso(),
    lanes: {
      // 未着手（未 Triage / allowlist 外の起票）は通常の判断待ちを埋没させるので分ける。
      action_required: ar.filter((i) => i.display_hint !== "未着手").map(card).sort(byStateSince),
      backlog: ar.filter((i) => i.display_hint === "未着手").map(card).sort(byStateSince),
      working: all.filter((i) => i.state === "Working").map(card),
      queued: all.filter((i) => i.state === "Queued").map(card)
        .sort((a, b) => (a.queue_position ?? 1e9) - (b.queue_position ?? 1e9)),
    },
    health: {
      graphql_remaining: runtime.graphqlRemaining,
      graphql_limit: runtime.graphqlLimit,
      graphql_reset_at: runtime.graphqlResetAt,
      rest_remaining: runtime.restRemaining,
      rest_limit: runtime.restLimit,
      rest_reset_at: runtime.restResetAt,
      running_jobs: running.size,
      last_poll_at: runtime.lastPollAt,
      degraded: degraded(db),
    },
  };
}

/**
 * パイプラインが静かに止まると「Action Required 0 件」が平穏に見えてしまう。
 * 理由を積んで常時バナー表示する。
 */
function degraded(db: DB): string[] {
  const out = [...runtime.degraded];
  if (runtime.lastPollAt) {
    const behind = Date.now() - Date.parse(runtime.lastPollAt);
    if (behind > 3 * 60_000) out.push(`ポーリング停止（${Math.floor(behind / 60_000)} 分更新なし）`);
  }
  const failed = jobs.recentFailures(db, nowIso(-60 * 60_000));
  if (failed > 0) out.push(`ジョブ滞留（${failed} 件 failed）`);
  return out;
}

const byStateSince = (a: Card, b: Card) => a.state_since.localeCompare(b.state_since);
const key = (repo: string, n: number) => `${repo}#${n}`;
