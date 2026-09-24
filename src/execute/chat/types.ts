import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { getVersionInfo } from "../../cli/version.ts";
import type { Config } from "../../config.ts";

export interface CardContext {
  repo: string;
  issue_number: number;
  title: string;
  display_hint: string;
  state_lane?: string;
  url?: string;
  error_detail?: { summary: string; detail: string };
  error_history?: Array<{
    at: string;
    summary: string;
    detail: string;
    job_type?: string;
  }>;
  job_history?: Array<{
    job_type: string;
    started_at: string;
    finished_at?: string;
    status: string;
    error_summary?: string;
  }>;
}

export type ChatMode = "investigate" | "brainstorm";

export interface ChatPayload {
  message?: string;
  card?: CardContext;
  conversation_id?: string;
  engine?: "agy" | "claude";
  mode?: ChatMode;
}

export interface AutopilotEnvironment {
  version: string;
  commit: string;
  sourceDir: string;
}

export function getAutopilotEnvironment(): AutopilotEnvironment {
  const info = getVersionInfo();

  // 1. 環境変数 AUTOPILOT_SOURCE_DIR（Nix パッケージ等で明示的に配置されている場合）
  if (process.env.AUTOPILOT_SOURCE_DIR && existsSync(process.env.AUTOPILOT_SOURCE_DIR)) {
    return {
      version: info.version,
      commit: info.commit,
      sourceDir: process.env.AUTOPILOT_SOURCE_DIR,
    };
  }

  // 2. ローカル開発時（bun run / dev 等での実行時）
  // bun build --compile された単一バイナリでは import.meta.dir は /$bunfs/root となり存在しないため、
  // 実際に存在する実体ディレクトリか検証する
  try {
    const localDir = resolve(import.meta.dir, "../../..");
    if (existsSync(join(localDir, "src")) && existsSync(join(localDir, "package.json"))) {
      return {
        version: info.version,
        commit: info.commit,
        sourceDir: localDir,
      };
    }
  } catch {
    // ignore
  }

  // 3. Chat 専用ワークスペース配下のクローン ($AUTOPILOT_HOME/chat-workspaces/<repo>)
  const home = process.env.AUTOPILOT_HOME || join(homedir(), ".autopilot");
  const chatWsDir = join(home, "chat-workspaces", "k-wa-wa", "nuage-autopilot4");
  if (existsSync(join(chatWsDir, "src"))) {
    return {
      version: info.version,
      commit: info.commit,
      sourceDir: chatWsDir,
    };
  }

  // 4. 実体ディレクトリが見つからない場合（単一バイナリ配布時で source 未同梱）
  return {
    version: info.version,
    commit: info.commit,
    sourceDir: "",
  };
}

export interface BuildInvestigatePromptOptions {
  card?: CardContext;
  userMessage?: string;
  env?: AutopilotEnvironment;
  mode?: ChatMode;
}

export interface ChatOptions {
  card?: CardContext;
  message?: string;
  conversationId?: string;
  engine?: "agy" | "claude";
  mode?: ChatMode;
  cfg?: Config;
  env?: AutopilotEnvironment;
}

export type ChatEvent =
  | {
      event: "init";
      data: {
        status?: string;
        mode?: string;
        engine?: string;
        conversation_id?: string;
        tools?: unknown;
      };
    }
  | { event: "thought"; data: { delta: string } }
  | { event: "tool_start"; data: { id?: string; name: string; args?: unknown } }
  | { event: "tool_end"; data: { id?: string; name: string; result?: unknown } }
  | { event: "text"; data: { delta: string } }
  | {
      event: "done";
      data: { status?: string; conversation_id?: string; usage?: unknown };
    }
  | { event: "error"; data: { message: string } };

export type EventCallback = (event: ChatEvent) => Promise<void> | void;
