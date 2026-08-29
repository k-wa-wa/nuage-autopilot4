import type { AgentConfig } from "../../config.ts";
import { runUsageCommand } from "./runner.ts";
import type {
  AdapterOptions,
  AgentAdapter,
  AgentUsage,
  AgentUsageLimit,
  Invocation,
} from "./types.ts";

/**
 * Antigravity (agy) の /usage コマンド出力をパースする。
 *
 * 例:
 * Gemini Models\tWeekly Limit Remaining\t85%\t2026-09-04T01:13:55Z
 * Gemini Models\tFive Hour Limit Remaining\t60%\t2026-08-29T14:50:37Z
 * Claude and GPT models\tWeekly Limit Remaining\t100%\t2026-09-05T13:31:29Z
 * Claude and GPT models\tFive Hour Limit Remaining\t100%\t2026-08-29T18:31:29Z
 */
export function parseAgyUsage(stdout: string): AgentUsageLimit[] {
  const limits: AgentUsageLimit[] = [];
  const lines = stdout.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    if (parts.length < 3) continue;

    const group = parts[0]?.trim() ?? "";
    const window = parts[1]?.trim() ?? "";
    const pctStr = parts[2]?.trim() ?? "";
    const resetAt = parts[3]?.trim() || null;

    const match = pctStr.match(/(\d+)%/);
    if (!match) continue;
    const remainingPct = Number.parseInt(match[1]!, 10);

    let groupShort = group;
    if (group.toLowerCase().includes("gemini")) groupShort = "Gemini";
    else if (group.toLowerCase().includes("claude")) groupShort = "Claude/GPT";

    let windowShort = window;
    if (/five hour|5.?h/i.test(window)) windowShort = "5h";
    else if (/week/i.test(window)) windowShort = "Weekly";

    const label = `${groupShort} (${windowShort})`;

    limits.push({
      label,
      remainingPct: Math.max(0, Math.min(100, remainingPct)),
      resetAt,
    });
  }

  return limits;
}

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

  async fetchUsage(command: string): Promise<AgentUsage | null> {
    const res = await runUsageCommand(command, ["-p", "/usage"]);
    const updatedAt = new Date().toISOString();

    if (!res.ok) {
      return {
        adapter: "agy",
        command,
        updatedAt,
        limits: [],
        error: res.stderr.trim() || "使用量の取得に失敗しました",
      };
    }

    const limits = parseAgyUsage(res.stdout);
    if (limits.length === 0) {
      return {
        adapter: "agy",
        command,
        updatedAt,
        limits: [],
        error: "使用量情報を解析できませんでした",
      };
    }

    return {
      adapter: "agy",
      command,
      updatedAt,
      limits,
    };
  },
};
