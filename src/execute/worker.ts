import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DB } from "../store/db.ts";
import * as items from "../store/items.ts";
import * as jobs from "../store/jobs.ts";
import * as runsStore from "../store/runs.ts";
import type { Config } from "../config.ts";
import { DEFAULTS, logDir, runDir } from "../config.ts";
import type { GitHubClient } from "../github/client.ts";
import * as verify from "../github/verify.ts";
import { nowIso } from "../types.ts";
import type { Item, Job, JobType, RunResult } from "../types.ts";
import { buildPrompt } from "./prompt.ts";
import { readResult, resultPath, promptPath, cleanup } from "./result.ts";
import { runAgent } from "./agent.ts";
import { ensureClone, prepare, targetBranch, headSha, readGate } from "./workspace.ts";
import { shaFromTriggerKey } from "../decide/ci.ts";

/**
 * AgentWorker（spec.md §7, §8）。
 *
 * exit 0 を信用しない。GitHub 側に成果物があることを確認して初めて completed にする。
 */

export interface WorkerDeps {
  db: DB;
  cfg: Config;
  gh: GitHubClient;
  botLogin: string;
  bootId: string;
  baseBranchOf: (repo: string) => string;
}

const HINT_OF: Record<JobType, "精緻化中" | "実装中" | "評価中"> = {
  refine: "精緻化中",
  implement: "実装中",
  evaluate: "評価中",
};

export interface Claimed {
  job: Job;
  logPath: string;
}

/**
 * ジョブを 1 件確保する（実行はしない）。
 *
 * 確保と実行を分けるのは、実行まで await してしまうと同時実行数が常に 1 になり
 * max_parallel が意味を失うため。同時実行の上限は fetchNextJob の SQL が担保する。
 */
export function claimJob(d: WorkerDeps): Claimed | null {
  const job = jobs.fetchNextJob(d.db, d.cfg.queue.max_parallel, process.pid, d.bootId);
  if (!job) return null;

  const logPath = join(logDir(d.cfg), job.repo, String(job.issue_number), `${job.id}.log`);
  mkdirSync(runDir(d.cfg), { recursive: true });

  // 取得と同一トランザクションで Working へ遷移させ、runs を作る。
  d.db.transaction(() => {
    items.withRetry(d.db, job.repo, job.issue_number, (it) =>
      items.transitionItem(d.db, it, { state: "Working", hint: HINT_OF[job.job_type] }),
    );
    runsStore.startRun(d.db, {
      job_id: job.id,
      repo: job.repo,
      issue_number: job.issue_number,
      job_type: job.job_type,
      log_path: logPath,
    });
  })();

  return { job, logPath };
}

/** 確保済みのジョブを実行する。 */
export async function runClaimed(d: WorkerDeps, { job, logPath }: Claimed): Promise<void> {
  const abort = new AbortController();
  const hb = setInterval(() => {
    const alive = jobs.heartbeat(d.db, job.id, process.pid, d.bootId);
    const cur = jobs.getJob(d.db, job.id);
    // cancel は DB を書くだけ。実際の停止はここで行う（PID 再利用による誤 kill を避ける）。
    if (!alive || cur?.status === "canceled") abort.abort();
  }, DEFAULTS.heartbeatMs);

  try {
    await execute(d, job, logPath, abort.signal);
  } catch (e) {
    fail(d, job, `worker error: ${String(e)}`);
  } finally {
    clearInterval(hb);
    cleanup(promptPath(runDir(d.cfg), job.id), resultPath(runDir(d.cfg), job.id));
  }
}

/** 1 件だけ取って実行する（テスト・逐次実行用）。取れなければ false。 */
export async function runOnce(d: WorkerDeps): Promise<boolean> {
  const c = claimJob(d);
  if (!c) return false;
  await runClaimed(d, c);
  return true;
}

async function execute(d: WorkerDeps, job: Job, logPath: string, signal: AbortSignal): Promise<void> {
  const it = items.getItem(d.db, job.repo, job.issue_number);
  if (!it) return fail(d, job, "item not found");

  const base = d.baseBranchOf(job.repo);
  const isNewPr = job.job_type === "implement" && it.pr_number === 0;

  // 実行前スナップショットは DB ではなく GitHub から取る。
  // Poller が 60 秒周期で items を書き換えるため、DB の値はジョブ実行中に動く。
  const snap = await verify.takeSnapshot(d.gh, job.repo, job.issue_number, it.pr_number);

  const dir = await ensureClone(d.cfg, job.repo);
  const branch = targetBranch(job.job_type, isNewPr, it.branch, base);
  await prepare(dir, branch);

  // evaluate の実行前 HEAD 検証。キュー待機中に人間が push していたら評価対象が入れ替わっている。
  if (job.job_type === "evaluate") {
    const want = shaFromTriggerKey(job.trigger_key);
    const have = await headSha(dir);
    if (want && have && !have.startsWith(want) && !want.startsWith(have)) {
      return stale(d, job, `evaluate target moved: ${want} -> ${have}`);
    }
  }

  const rPath = resultPath(runDir(d.cfg), job.id);
  const prompt = buildPrompt({
    jobType: job.job_type,
    repo: job.repo,
    issueNumber: job.issue_number,
    issueTitle: it.title,
    jobContext: job.job_context,
    resultPath: rPath,
    baseBranch: base,
    prNumber: it.pr_number,
    gate: job.job_type === "refine" ? null : await readGate(dir, base),
  });

  const agent = d.cfg.agents[job.job_type];
  const res = await runAgent({
    agent,
    prompt,
    cwd: dir,
    timeoutMs: agent.timeout_sec * 1000,
    withToken: true,
    elevated: true,
    token: d.cfg.token,
    promptPath: promptPath(runDir(d.cfg), job.id),
    logPath,
    signal,
  });

  if (res.kind === "canceled") return canceled(d, job);
  if (res.kind === "timeout") return fail(d, job, "timeout", "TIMEOUT");
  if (res.code !== 0) return fail(d, job, `agent exited with ${res.code}`);

  const parsed = readResult(rPath, job.job_type === "evaluate");
  if (!parsed.ok) return fail(d, job, parsed.reason);
  const r = parsed.value;

  // blocked は設計された出口。ただし選択肢コメントが Issue / PR 側に存在することを検証する。
  if (r.status === "blocked") {
    const ok = await verify.botCommentedSince(
      d.gh, job.repo, job.issue_number, it.pr_number, d.botLogin, snap, "any",
    );
    if (!ok) return fail(d, job, "blocked but no option comment was posted");
    finish(d, job, "completed", "BLOCKED", r.summary, r.next_context, (cur) =>
      items.transitionItem(d.db, cur, {
        state: "ActionRequired",
        hint: "助言待ち",
        blockedFrom: job.job_type,
        recheckNeeded: true,
      }),
    );
    return;
  }

  switch (job.job_type) {
    case "refine": {
      const ok = await verify.botCommentedSince(
        d.gh, job.repo, job.issue_number, it.pr_number, d.botLogin, snap, "any",
      );
      if (!ok) return fail(d, job, "refine posted no comment");
      finish(d, job, "completed", "SUCCESS", r.summary, r.next_context, (cur) =>
        items.transitionItem(d.db, cur, {
          state: "ActionRequired", hint: "仕様確認待ち", blockedFrom: job.job_type, recheckNeeded: true,
        }),
      );
      return;
    }

    case "implement": {
      if (isNewPr) {
        const pr = await verify.findNewPr(d.gh, job.repo, job.issue_number, d.botLogin);
        if (!pr) return fail(d, job, "no PR with Closes #n was created");
        finish(d, job, "completed", "SUCCESS", r.summary, r.next_context, (cur) => {
          items.refreshFromGitHub(d.db, cur, {
            pr_number: pr.number, branch: pr.branch, head_sha: pr.headSha,
          });
          const fresh = items.getItem(d.db, cur.repo, cur.issue_number)!;
          return items.transitionItem(d.db, fresh, {
            state: "Working", hint: "CI 待ち", setCiSince: nowIso(), recheckNeeded: true,
          });
        });
        return;
      }
      const pushed = await verify.headChangedSince(d.gh, job.repo, job.issue_number, it.pr_number, snap);
      if (!pushed) return fail(d, job, "head_sha did not change");
      finish(d, job, "completed", "SUCCESS", r.summary, r.next_context, (cur) =>
        items.transitionItem(d.db, cur, {
          state: "Working", hint: "CI 待ち", setCiSince: nowIso(), recheckNeeded: true,
        }),
      );
      return;
    }

    case "evaluate": {
      if (r.verdict === "merge_ready") {
        const ok = await verify.botCommentedSince(
          d.gh, job.repo, job.issue_number, it.pr_number, d.botLogin, snap, "pr",
        );
        if (!ok) return fail(d, job, "merge_ready but no PR comment");
        finish(d, job, "completed", "SUCCESS", r.summary, r.next_context, (cur) =>
          items.transitionItem(d.db, cur, {
            state: "ActionRequired", hint: "マージ待ち", blockedFrom: job.job_type,
            retryCount: 0, recheckNeeded: true,
          }),
        );
        return;
      }
      // needs_work はコメントを求めない。人間への通知を出さず静かに差し戻す。
      finish(d, job, "completed", "SUCCESS", r.summary, r.next_context, (cur) => {
        const id = jobs.enqueueJob(d.db, {
          repo: job.repo, issue_number: job.issue_number, job_type: "implement",
          job_context: r.next_context, trigger_key: `verdict:${job.id}`,
        });
        return items.transitionItem(d.db, cur, {
          state: id ? "Queued" : "ActionRequired",
          hint: id ? "着手待ち" : "エラー対応待ち",
          retryCount: cur.retry_count + 1,
          recheckNeeded: true,
        });
      });
      return;
    }
  }
}

/** 終端遷移。runs の終端化と items の遷移を同一トランザクションで行う。 */
function finish(
  d: WorkerDeps, job: Job, status: "completed" | "canceled",
  result: RunResult, summary: string, next: string,
  transition: (it: Item) => unknown,
): void {
  d.db.transaction(() => {
    jobs.finishJob(d.db, job.id, status);
    runsStore.endRun(d.db, job.id, result, { summary, next_context: next });
    items.withRetry(d.db, job.repo, job.issue_number, (it) => transition(it));
  })();
}

function fail(d: WorkerDeps, job: Job, reason: string, result: RunResult = "FAIL"): void {
  d.db.transaction(() => {
    jobs.finishJob(d.db, job.id, "failed");
    runsStore.endRun(d.db, job.id, result, { summary: reason });
    items.withRetry(d.db, job.repo, job.issue_number, (it) =>
      items.transitionItem(d.db, it, {
        state: "ActionRequired", hint: "エラー対応待ち", blockedFrom: job.job_type, recheckNeeded: true,
      }),
    );
  })();
}

function canceled(d: WorkerDeps, job: Job): void {
  d.db.transaction(() => {
    jobs.finishJob(d.db, job.id, "canceled");
    runsStore.endRun(d.db, job.id, "CANCELED", { summary: "canceled by human" });
    items.withRetry(d.db, job.repo, job.issue_number, (it) =>
      items.transitionItem(d.db, it, { state: "ActionRequired", hint: "中止済み", recheckNeeded: true }),
    );
  })();
}

/**
 * 陳腐化。人間が push しただけでエラー扱いにはしない（正常な追い越し）。
 * 新しい SHA の CI 結果が改めて evaluate を積むため取りこぼしは起きない。
 */
function stale(d: WorkerDeps, job: Job, reason: string): void {
  d.db.transaction(() => {
    jobs.finishJob(d.db, job.id, "canceled");
    runsStore.endRun(d.db, job.id, "CANCELED", { summary: reason });
    items.markRecheck(d.db, job.repo, job.issue_number);
  })();
}

/** 起動時・稼働中の孤児回収。runs も終端化して RUNNING を残さない。 */
export function recover(d: WorkerDeps, onStartup: boolean): number {
  const orphans = jobs.recoverOrphans(d.db, { onStartup });
  for (const o of orphans) {
    runsStore.endRun(d.db, o.id, "FAIL", { summary: "orphan recovery" });
    const j = jobs.getJob(d.db, o.id);
    if (j?.status === "failed") {
      items.withRetry(d.db, o.repo, o.issue_number, (it) =>
        items.transitionItem(d.db, it, {
          state: "ActionRequired", hint: "エラー対応待ち", recheckNeeded: true,
        }),
      );
    }
  }
  return orphans.length;
}

