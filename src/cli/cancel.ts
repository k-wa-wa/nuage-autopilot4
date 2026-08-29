import { dbPath, loadConfig } from "../config.ts";
import { openDb } from "../store/db.ts";
import * as jobs from "../store/jobs.ts";

export function parseCancelTarget(target?: string): { repo: string; issueNumber: number } {
  if (!target) throw new Error("usage: autopilot cancel <owner>/<repo>#<issue>");
  const m = /^(.+)#(\d+)$/.exec(target);
  if (!m) throw new Error(`bad target: ${target}`);
  return { repo: m[1]!, issueNumber: Number(m[2]) };
}

export async function cmdCancel(target?: string, configPath?: string): Promise<void> {
  const { repo, issueNumber } = parseCancelTarget(target);
  const cfg = loadConfig(configPath);
  const db = openDb(dbPath(cfg));
  // cancel は DB を書くだけ。プロセス終了と items の更新は run 側が行う
  // （PID は OS に再利用されるため、無関係なプロセスを殺しうる）。
  const n = jobs.cancelJobsFor(db, repo, issueNumber);
  console.log(
    n > 0
      ? `${n} 件のジョブを中止しました。次のハートビートで停止します（最大 60 秒）。`
      : "対象のジョブはありません。",
  );
}
