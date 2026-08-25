import { basename } from "node:path";
import type { AgentConfig } from "../config.ts";

/**
 * エージェント CLI アダプタ（spec.md §8）。
 * command のコマンド名（パス指定なら basename）から解決する。
 */

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

export function resolveAdapter(cmd: string): "claude" | "agy" | "exec" {
  const name = basename(cmd);
  if (name === "claude") return "claude";
  if (name === "agy") return "agy";
  return "exec";
}

export function buildInvocation(agent: AgentConfig, o: AdapterOptions): Invocation {
  const kind = resolveAdapter(agent.command);

  if (kind === "claude") {
    const argv = [agent.command, "-p"];
    if (o.elevated) argv.push("--permission-mode", "bypassPermissions");
    if (agent.model) argv.push("--model", agent.model);
    return { argv, channel: "stdin" };
  }

  if (kind === "agy") {
    // agy の print モードは独自のタイムアウト（既定 5 分）を持つ。
    // 渡さないと実装ジョブが 5 分で勝手に打ち切られる。ワーカー上限の 30 秒手前を渡し、
    // 強制終了より先に agy 自身の出力をログへ残す。
    const printTimeout = Math.max(30, Math.floor(o.timeoutMs / 1000) - 30);
    const argv = [agent.command, "--print", `以下の指示ファイルを読み、タスクを完走せよ: ${o.promptPath}`];
    if (o.elevated) argv.push("--dangerously-skip-permissions");
    argv.push("--disable-slash-commands", "--print-timeout", String(printTimeout));
    if (agent.model) argv.push("--model", agent.model);
    return { argv, channel: "file" };
  }

  return { argv: [agent.command, ...(agent.args ?? [])], channel: "stdin" };
}
