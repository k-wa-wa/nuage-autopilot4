import type { AgentConfig } from "../../config.ts";

export type PromptChannel = "stdin" | "file";

export interface Invocation {
  argv: string[];
  channel: PromptChannel;
}

export interface AdapterOptions {
  /** プロンプトを一時ファイルに書く場合のパス（channel === "file" のとき使う）。 */
  promptPath: string;
  /** ワーカー側の実行タイムアウト（ミリ秒）。agy の --print-timeout に使う。 */
  timeoutMs: number;
  /** Triage は権限昇格しない。 */
  elevated: boolean;
}

export type AdapterKind = "claude" | "agy" | "exec";

export interface AgentUsageLimit {
  label: string;
  remainingPct: number; // 0-100
  resetAt: string | null;
}

export interface AgentUsage {
  adapter: AdapterKind;
  command: string;
  updatedAt: string;
  limits: AgentUsageLimit[];
  error?: string;
}

export interface AgentAdapter {
  readonly kind: AdapterKind;
  buildInvocation(agent: AgentConfig, o: AdapterOptions): Invocation;
  fetchUsage?(command: string): Promise<AgentUsage | null>;
}
