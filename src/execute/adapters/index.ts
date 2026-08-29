/**
 * エージェント CLI アダプタ（spec.md §8）。
 * command のコマンド名からアダプタを解決し、起動引数を組み立てるエントリポイント。
 */
import { basename } from "node:path";
import type { AgentConfig } from "../../config.ts";
import { agyAdapter } from "./agy.ts";
import { claudeAdapter } from "./claude.ts";
import { execAdapter } from "./exec.ts";
import type { AdapterKind, AdapterOptions, AgentAdapter, Invocation } from "./types.ts";

export type {
  AdapterKind,
  AdapterOptions,
  AgentAdapter,
  Invocation,
  PromptChannel,
} from "./types.ts";
export { agyAdapter, claudeAdapter, execAdapter };

const ADAPTERS: Record<AdapterKind, AgentAdapter> = {
  claude: claudeAdapter,
  agy: agyAdapter,
  exec: execAdapter,
};

/**
 * コマンド名（パス指定なら basename）からアダプタ種別を解決する。
 */
export function resolveAdapter(cmd: string): AdapterKind {
  const name = basename(cmd);
  if (name === "claude") return "claude";
  if (name === "agy") return "agy";
  return "exec";
}

/**
 * コマンド名から適切なアダプタインスタンスを取得する。
 */
export function getAdapter(cmd: string): AgentAdapter {
  const kind = resolveAdapter(cmd);
  return ADAPTERS[kind];
}

/**
 * エージェント設定と実行時オプションから起動引数（Invocation）を生成する。
 */
export function buildInvocation(agent: AgentConfig, o: AdapterOptions): Invocation {
  const adapter = getAdapter(agent.command);
  return adapter.buildInvocation(agent, o);
}
