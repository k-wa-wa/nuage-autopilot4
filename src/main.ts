import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { loadConfig, dbPath, lockPath, runDir, logDir, repoSlug, DEFAULTS } from "./config.ts";
import type { Config } from "./config.ts";
import { openDb } from "./store/db.ts";
import * as jobs from "./store/jobs.ts";
import { createClient, rateLimitState } from "./github/client.ts";
import { pollRepo } from "./collect/poller.ts";
import { dispatch } from "./decide/dispatcher.ts";
import type { DispatchDeps } from "./decide/dispatcher.ts";
import { tick } from "./decide/tick.ts";
import { claimJob, runClaimed, recover } from "./execute/worker.ts";
import type { WorkerDeps } from "./execute/worker.ts";
import { startServer } from "./view/server.tsx";
import { buildState, runtime } from "./view/state.ts";
import { acquireLock } from "./cli/lock.ts";
import { doctor, printChecks } from "./cli/doctor.ts";
import { nowIso } from "./types.ts";

const [, , cmd, ...rest] = process.argv;

// --config / -c を取り出す（config.ts の記載どおり AUTOPILOT_CONFIG より優先する）。
let configPath: string | undefined;
const args: string[] = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]!;
  if (a === "-c" || a === "--config") configPath = rest[++i];
  else if (a.startsWith("--config=")) configPath = a.slice("--config=".length);
  else args.push(a);
}

try {
  switch (cmd) {
    case "run": await cmdRun(); break;
    case "doctor": await cmdDoctor(); break;
    case "cancel": await cmdCancel(args[0]); break;
    case "status": await cmdStatus(); break;
    default: usage();
  }
} catch (e) {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

function usage(): never {
  console.log(`autopilot

  run                      常駐（収集・判定・実行・Dashboard）。多重起動は不可
  status                   ターミナルで手番・自走中・キューを表示
  cancel <repo>#<issue>    該当アイテムのジョブを中止する
  doctor                   設定と接続性を起動前に検証する

  -c, --config <path>      設定ファイル（既定: $AUTOPILOT_CONFIG または $AUTOPILOT_HOME/config.yaml）

環境変数:
  GH_TOKEN                 bot アカウントのトークン（必須）
  AUTOPILOT_HOME           DB・ワークスペース・ログの置き場（既定: ~/.autopilot）`);
  process.exit(cmd ? 1 : 0);
}

async function cmdDoctor(): Promise<void> {
  const cfg = loadConfig(configPath);
  const ok = printChecks(await doctor(cfg, createClient(cfg.token)));
  process.exit(ok ? 0 : 1);
}

async function cmdCancel(target?: string): Promise<void> {
  if (!target) throw new Error("usage: autopilot cancel <owner>/<repo>#<issue>");
  const m = /^(.+)#(\d+)$/.exec(target);
  if (!m) throw new Error(`bad target: ${target}`);
  const cfg = loadConfig(configPath);
  const db = openDb(dbPath(cfg));
  // cancel は DB を書くだけ。プロセス終了と items の更新は run 側が行う
  // （PID は OS に再利用されるため、無関係なプロセスを殺しうる）。
  const n = jobs.cancelJobsFor(db, m[1]!, Number(m[2]));
  console.log(n > 0 ? `${n} 件のジョブを中止しました。次のハートビートで停止します（最大 60 秒）。` : "対象のジョブはありません。");
}

async function cmdStatus(): Promise<void> {
  const cfg = loadConfig(configPath);
  try {
    const res = await fetch(`http://127.0.0.1:${cfg.dashboard.port}/api/state`);
    const s = (await res.json()) as ReturnType<typeof buildState>;
    const lane = (title: string, cards: typeof s.lanes.action_required) => {
      console.log(`\n${title} (${cards.length})`);
      for (const c of cards) {
        const prInfo = c.pr_number > 0 ? ` (PR #${c.pr_number})` : "";
        console.log(`  ${c.repo}#${c.issue_number}${prInfo}  ${c.display_hint.padEnd(18)} ${c.title}`);
      }
    };
    lane("🧑 Action Required", s.lanes.action_required);
    lane("🤖 Working", s.lanes.working);
    lane("📦 Queued", s.lanes.queued);
    if (s.health.degraded.length) console.log(`\n!  ${s.health.degraded.join(" / ")}`);
  } catch {
    console.error("autopilot is not running");
    process.exit(1);
  }
}

async function cmdRun(): Promise<void> {
  const cfg = loadConfig(configPath);
  for (const d of [cfg.home, runDir(cfg), logDir(cfg)]) mkdirSync(d, { recursive: true });

  const bootId = randomUUID();
  const lock = acquireLock(lockPath(cfg), bootId);
  if ("heldBy" in lock) {
    console.error(`autopilot is already running (pid ${lock.heldBy})`);
    process.exit(1);
  }

  const gh = createClient(cfg.token);
  if (!printChecks(await doctor(cfg, gh))) {
    lock.release();
    process.exit(1);
  }
  const botLogin = await gh.viewerLogin();
  const db = openDb(dbPath(cfg));

  // 既定ブランチは main 決め打ちにしない。設定に無ければ起動時に 1 回だけ解決してキャッシュする。
  const baseBranches = await resolveBaseBranches(cfg, gh);

  const log = (level: "info" | "warn", msg: string) =>
    console.log(`${nowIso()} [${level}] ${msg}`);

  const dd: DispatchDeps = {
    db, cfg, gh, botLogin,
    monitored: new Set(cfg.repos.map(repoSlug)),
    log,
  };
  const wd: WorkerDeps = {
    db, cfg, gh, botLogin, bootId,
    baseBranchOf: (repo) => baseBranches.get(repo) ?? "main",
  };

  // 起動時点の running はすべて前回プロセスの残骸。
  const recovered = recover(wd, true);
  if (recovered > 0) log("info", `recovered ${recovered} orphaned job(s)`);

  const server = startServer(db, cfg.dashboard.port, cfg.dashboard.host);
  log("info", `dashboard http://${cfg.dashboard.host}:${cfg.dashboard.port}`);

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
  void loop(() => rateLimitState.pollIntervalMs(), async () => {
    if (rateLimitState.stopped()) {
      runtime.degraded.add("レートリミット待機中");
      return;
    }
    runtime.degraded.delete("レートリミット待機中");
    for (const r of cfg.repos) {
      const out = await pollRepo(db, gh, r, botLogin);
      if (out.error) {
        log("warn", `${out.repo}: poll ${out.error}`);
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
  }, (e) => log("warn", `poll loop: ${String(e)}`), () => stopping);

  // Tick（時間経過だけで動く判定）
  void loop(() => DEFAULTS.tickIntervalMs, async () => {
    recover(wd, false);
    await tick(dd);
  }, (e) => log("warn", `tick loop: ${String(e)}`), () => stopping);

  // ③ 実行。同時実行の上限は fetchNextJob の SQL が担保するので、
  //    ここでは確保できる限り起動して並行に走らせる（await 直列にすると常に 1 件になる）。
  const inflight = new Set<Promise<void>>();
  void loop(() => 1000, async () => {
    for (;;) {
      const c = claimJob(wd);
      if (!c) break;
      const p = runClaimed(wd, c)
        .catch((e) => log("warn", `job ${c.job.id}: ${String(e)}`))
        .finally(() => inflight.delete(p));
      inflight.add(p);
    }
  }, (e) => log("warn", `worker loop: ${String(e)}`), () => stopping);

  await new Promise(() => { /* 常駐 */ });
}

/** repos[].base_branch が無いリポジトリの既定ブランチを GraphQL で解決する。 */
async function resolveBaseBranches(cfg: Config, gh: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const r of cfg.repos) {
    if (r.base_branch) {
      out.set(repoSlug(r), r.base_branch);
      continue;
    }
    const { data } = await gh.graphql<{ repository: { defaultBranchRef: { name: string } | null } | null }>(
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

async function loop(
  intervalMs: () => number,
  body: () => Promise<void>,
  onError: (e: unknown) => void,
  stopped: () => boolean,
): Promise<void> {
  while (!stopped()) {
    try { await body(); } catch (e) { onError(e); }
    await Bun.sleep(intervalMs());
  }
}

