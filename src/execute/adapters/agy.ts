import type { AgentConfig } from "../../config.ts";
import type { AdapterOptions, AgentAdapter, Invocation } from "./types.ts";

export const agyAdapter: AgentAdapter = {
  kind: "agy",
  buildInvocation(agent: AgentConfig, o: AdapterOptions): Invocation {
    // agy の print モードは独自のタイムアウト（既定 5 分）を持つ。
    // 渡さないと実装ジョブが 5 分で勝手に打ち切られる。ワーカー上限の 30 秒手前を渡し、
    // 強制終了より先に agy 自身の出力をログへ残す。
    const printTimeout = Math.max(30, Math.floor(o.timeoutMs / 1000) - 30);
    const argv = [
      agent.command,
      "--print",
      `以下の指示ファイルを読み、タスクを完走せよ: ${o.promptPath}`,
    ];
    if (o.elevated) argv.push("--dangerously-skip-permissions");
    argv.push("--disable-slash-commands", "--print-timeout", String(printTimeout));
    if (agent.model) argv.push("--model", agent.model);
    return { argv, channel: "file" };
  },
};
