import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { pollRepo } from "../collect/poller.ts";
import type { Config } from "../config.ts";
import { DEFAULTS, dbPath, loadConfig, lockPath, logDir, repoSlug, runDir } from "../config.ts";
import type { DispatchDeps } from "../decide/dispatcher.ts";
import { dispatch } from "../decide/dispatcher.ts";
import { tick } from "../decide/tick.ts";
import type { WorkerDeps } from "../execute/worker.ts";
import { claimJob, recover, runClaimed } from "../execute/worker.ts";
import { createClient, rateLimitState } from "../github/client.ts";
import { log } from "../log.ts";
import { openDb } from "../store/db.ts";
import { nowIso } from "../types.ts";
import { startServer } from "../view/server.tsx";
import { runtime } from "../view/state.ts";
import { doctor, printChecks } from "./doctor.ts";
import { acquireLock } from "./utils/lock.ts";

export async function cmdRun(configPath?: string): Promise<void> {
  const cfg = loadConfig(configPath);
  for (const d of [cfg.home, runDir(cfg), logDir(cfg)]) mkdirSync(d, { recursive: true });

  const bootId = randomUUID();
  const lock = acquireLock(lockPath(cfg), bootId);
  if ("heldBy" in lock) {
    log("error", `another autopilot is already running (pid ${lock.heldBy})`);
    process.exit(1);
  }

  const gh = createClient(cfg.token);
  if (!printChecks(await doctor(cfg, gh))) {
    log("error", "startup aborted: doctor found fatal problem(s)");
    lock.release();
    process.exit(1);
  }
  const botLogin = await gh.viewerLogin();
  const db = openDb(dbPath(cfg));

  // 既定ブランチは main 決め打ちにしない。設定に無ければ起動時に 1 回だけ解決してキャッシュする。
  const baseBranches = await resolveBaseBranches(cfg, gh);

  const dd: DispatchDeps = {
    db,
    cfg,
    gh,
    botLogin,
    monitored: new Set(cfg.repos.map(repoSlug)),
    log,
  };
  const wd: WorkerDeps = {
    db,
    cfg,
    gh,
    botLogin,
    bootId,
    baseBranchOf: (repo) => baseBranches.get(repo) ?? "main",
    log,
  };

  // 起動時点の running はすべて前回プロセスの残骸。
  const recovered = recover(wd, true);
  if (recovered > 0) log("info", `recovered ${recovered} orphaned job(s)`);

  const server = startServer(db, cfg.dashboard.port, cfg.dashboard.host);
  log("info", `autopilot started (dashboard: http://${cfg.dashboard.host}:${cfg.dashboard.port})`);

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    log("info", "shutting down");
    server.stop();
    lock.release();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // ① 収集 → ② 判定
  void loop(
    () => rateLimitState.pollIntervalMs(),
    async () => {
      if (rateLimitState.stopped()) {
        runtime.degraded.add("レートリミット待機中");
        return;
      }
      runtime.degraded.delete("レートリミット待機中");
      for (const r of cfg.repos) {
        const out = await pollRepo(db, gh, r, botLogin);
        if (out.error) {
          log("warn", `${out.repo}: poll failed (${out.error})`);
          if (out.error === "not_found" || out.error === "forbidden") {
            runtime.degraded.add(`監視対象外: ${out.repo}`);
          }
          continue;
        }
        runtime.degraded.delete(`監視対象外: ${out.repo}`);
        if (out.coldStart) log("info", `${out.repo}: cold start seeded`);
        // Triage Agent の呼び出しは直列（LLM プロバイダの RPM / TPM 制約）。
        for (const c of out.changed) await dispatch(dd, out.repo, c.issueNumber);
      }
      runtime.lastPollAt = nowIso();
      runtime.graphqlRemaining = rateLimitState.graphqlRemaining;
      runtime.graphqlLimit = rateLimitState.graphqlLimit;
      runtime.graphqlResetAt = rateLimitState.graphqlResetAt;
      runtime.restRemaining = gh.restRemaining();
      runtime.restLimit = gh.restLimit();
      runtime.restResetAt = gh.restResetAt();
    },
    (e) => log("warn", `poll loop: ${String(e)}`),
    () => stopping,
  );

  // Tick（時間経過だけで動く判定）
  void loop(
    () => DEFAULTS.tickIntervalMs,
    async () => {
      recover(wd, false);
      await tick(dd);
    },
    (e) => log("warn", `tick loop: ${String(e)}`),
    () => stopping,
  );

  // ③ 実行。同時実行の上限は fetchNextJob の SQL が担保するので、
  //    ここでは確保できる限り起動して並行に走らせる（await 直列にすると常に 1 件になる）。
  const inflight = new Set<Promise<void>>();
  void loop(
    () => 1000,
    async () => {
      for (;;) {
        const c = claimJob(wd);
        if (!c) break;
        const p = runClaimed(wd, c)
          .catch((e) => log("warn", `job ${c.job.id}: unexpected error: ${String(e)}`))
          .finally(() => inflight.delete(p));
        inflight.add(p);
      }
    },
    (e) => log("warn", `worker loop: ${String(e)}`),
    () => stopping,
  );

  await new Promise(() => {
    /* 常駐 */
  });
}

/** repos[].base_branch が無いリポジトリの既定ブランチを GraphQL で解決する。 */
export async function resolveBaseBranches(
  cfg: Config,
  gh: ReturnType<typeof createClient>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const r of cfg.repos) {
    if (r.base_branch) {
      out.set(repoSlug(r), r.base_branch);
      continue;
    }
    const { data } = await gh.graphql<{
      repository: { defaultBranchRef: { name: string } | null } | null;
    }>(
      `query Base($owner: String!, $repo: String!) {
         rateLimit { cost remaining resetAt }
         repository(owner: $owner, name: $repo) { defaultBranchRef { name } }
       }`,
      { owner: r.owner, repo: r.name },
    );
    const name = data.repository?.defaultBranchRef?.name;
    if (!name) throw new Error(`${repoSlug(r)}: 既定ブランチを解決できない`);
    out.set(repoSlug(r), name);
  }
  return out;
}

export async function loop(
  intervalMs: () => number,
  body: () => Promise<void>,
  onError: (e: unknown) => void,
  stopped: () => boolean,
): Promise<void> {
  while (!stopped()) {
    try {
      await body();
    } catch (e) {
      onError(e);
    }
    await Bun.sleep(intervalMs());
  }
}
