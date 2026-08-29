import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AgentConfig } from "../config.ts";
import { DEFAULTS } from "../config.ts";
import { buildInvocation } from "./adapters.ts";

/**
 * エージェント CLI の起動（spec.md §8）。
 *
 * プロンプトは argv に直接載せない（MAX_ARG_STRLEN 約 128KiB）。
 * 認証情報は環境変数でのみ渡し、プロンプト本文には決して書かない。
 */

export interface RunAgentOptions {
  agent: AgentConfig;
  prompt: string;
  cwd: string;
  timeoutMs: number;
  /** GH_TOKEN を渡すか。Triage には渡さない。 */
  withToken: boolean;
  /** 権限を昇格するか（bypassPermissions / dangerously-skip-permissions）。Triage は false。 */
  elevated: boolean;
  token?: string;
  promptPath?: string;
  logPath?: string;
  /** 中止・タイムアウトのためのシグナル。 */
  signal?: AbortSignal;
}

export type RunAgentResult =
  | { kind: "exited"; code: number; stdout: string; stderr: string }
  | { kind: "timeout" }
  | { kind: "canceled" };

export async function runAgent(o: RunAgentOptions): Promise<RunAgentResult> {
  const promptPath = o.promptPath ?? `${o.cwd}/.autopilot-prompt.md`;
  const inv = buildInvocation(o.agent, {
    promptPath,
    timeoutMs: o.timeoutMs,
    elevated: o.elevated,
  });

  // 長さの上限は argv（MAX_ARG_STRLEN）の話であって stdin には無い。
  // stdin アダプタでファイルに逃がすと、プロンプトがどこにも渡らない。
  const useFile = inv.channel === "file";
  if (useFile) {
    mkdirSync(dirname(promptPath), { recursive: true });
    writeFileSync(promptPath, o.prompt, "utf8");
  }

  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  if (o.withToken && o.token) {
    env.GH_TOKEN = o.token;
    env.GITHUB_TOKEN = o.token;
  }

  const proc = Bun.spawn(inv.argv, {
    cwd: o.cwd,
    env,
    stdin: useFile ? "ignore" : new TextEncoder().encode(o.prompt),
    stdout: "pipe",
    stderr: "pipe",
    // プロセスグループごと終了させるため
    ...({} as Record<string, never>),
  });

  // 打ち切りの判定とプロセス終了を 1 本にする。別々のタイマーにすると
  // 「殺したがフラグが立つ前に exited が解決する」競合が起きる。
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    kill(proc);
  }, o.timeoutMs);
  const onAbort = () => kill(proc);
  o.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (o.logPath) writeLog(o.logPath, inv.argv, stdout, stderr, code);
    if (o.signal?.aborted) return { kind: "canceled" };
    if (timedOut) return { kind: "timeout" };
    return { kind: "exited", code, stdout: mask(stdout), stderr: mask(stderr) };
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener("abort", onAbort);
  }
}

function kill(proc: { kill: (sig?: number | NodeJS.Signals) => void }): void {
  try {
    proc.kill("SIGTERM");
    setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }, DEFAULTS.killGraceMs);
  } catch {
    /* already gone */
  }
}

/** ログと job_context にはトークンが混入しうる。保存前にマスクする。 */
const TOKEN_RE =
  /\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9_-]{20,})\b/g;

export function mask(s: string): string {
  return s.replace(TOKEN_RE, "***REDACTED***");
}

function writeLog(
  path: string,
  argv: string[],
  stdout: string,
  stderr: string,
  code: number,
): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(
    path,
    [
      `$ ${mask(argv.join(" "))}`,
      "--- stdout ---",
      mask(stdout),
      "--- stderr ---",
      mask(stderr),
      `--- exit ${code} ---`,
      "",
    ].join("\n"),
    "utf8",
  );
}
