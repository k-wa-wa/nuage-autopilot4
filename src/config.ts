import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import type { JobType } from "./types.ts";

export interface RepoConfig {
  owner: string;
  name: string;
  base_branch?: string;
}
export interface AgentConfig {
  command: string;
  model?: string;
  args?: string[];
  timeout_sec: number;
}

export interface Config {
  home: string;
  token: string;
  repos: RepoConfig[];
  allowlist: string[];
  agents: Record<"triage" | JobType, AgentConfig>;
  queue: { max_parallel: number };
  dashboard: { host: string; port: number };
}

/** 既定値の正本。spec.md の各節はここを参照する。 */
export const DEFAULTS = {
  pollIntervalMs: 60_000,
  tickIntervalMs: 60_000,
  cursorOverlapMs: 5 * 60_000,
  coldStartDays: 30,
  ciGraceMs: 10 * 60_000,
  ciStallMs: 30 * 60_000,
  retryLimit: 5,
  triageFailLimit: 3,
  orphanAttemptLimit: 3,
  leaseMs: 5 * 60_000,
  heartbeatMs: 60_000,
  killGraceMs: 10_000,
  promptFileThreshold: 60_000,
  rateLimitSlowRemaining: 1000,
  rateLimitSlowMs: 300_000,
  rateLimitStopRemaining: 200,
  verifyRetries: 7,
  verifyIntervalMs: 2_000,
  phase1PageSize: 50,
  phase2ChunkSize: 100,
  subIssuePageSize: 50,
  commentPageSize: 20,
} as const;

const AGENT_DEFAULTS: Record<"triage" | JobType, AgentConfig> = {
  triage: { command: "claude", model: "haiku", timeout_sec: 120 },
  refine: { command: "claude", timeout_sec: 900 },
  implement: { command: "claude", timeout_sec: 3600 },
  evaluate: { command: "claude", timeout_sec: 1800 },
};

export function loadConfig(configPath?: string): Config {
  const home = process.env.AUTOPILOT_HOME || join(homedir(), ".autopilot");
  const path = configPath || process.env.AUTOPILOT_CONFIG || join(home, "config.yaml");
  if (!existsSync(path)) throw new Error(`config not found: ${path}`);

  const raw = parse(readFileSync(path, "utf8")) as Partial<Config> | null;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
  if (!token) throw new Error("GH_TOKEN is required (bot account token)");

  const repos = raw?.repos ?? [];
  if (repos.length === 0) throw new Error("config.repos is empty");
  const allowlist = raw?.allowlist ?? [];
  if (allowlist.length === 0) throw new Error("config.allowlist is empty");

  const agents = { ...AGENT_DEFAULTS };
  for (const k of Object.keys(AGENT_DEFAULTS) as Array<"triage" | JobType>) {
    const v = raw?.agents?.[k];
    if (v) agents[k] = { ...AGENT_DEFAULTS[k], ...v };
  }

  return {
    home,
    token,
    repos,
    allowlist,
    agents,
    queue: { max_parallel: raw?.queue?.max_parallel ?? 2 },
    dashboard: {
      // 既定はループバック。認証を持たないため、0.0.0.0 にするのは
      // 信頼できるネットワークに限ること（読み取り専用だが Issue の題名と状態が見える）。
      host: raw?.dashboard?.host ?? "127.0.0.1",
      port: raw?.dashboard?.port ?? 8787,
    },
  };
}

export const repoSlug = (r: RepoConfig) => `${r.owner}/${r.name}`;
export const dbPath = (c: Config) => join(c.home, "autopilot.db");
export const lockPath = (c: Config) => join(c.home, "autopilot.lock");
export const runDir = (c: Config) => join(c.home, "run");
export const logDir = (c: Config) => join(c.home, "logs");
export const workspaceDir = (c: Config, repo: string) => join(c.home, "workspaces", repo);
