import type { Config } from "../../config.ts";
import { buildChatInvocation } from "../adapters/index.ts";
import { ensureChatWorkspace, type GitRunner } from "../workspace.ts";
import { buildInvestigatePrompt } from "./prompt.ts";
import type { AutopilotEnvironment, CardContext, ChatMode, EventCallback } from "./types.ts";

/**
 * ローカル CLI 実行ファイルの存在確認
 */
export function isCliAvailable(cliName: "agy" | "claude"): boolean {
  try {
    const res = Bun.spawnSync(["which", cliName], {
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
    });
    return res.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * 実機エージェント実行前に Chat 専用ワークスペース（chat-workspaces/<repo>）を準備する。
 *
 * エージェントは権限確認なしで動くため、メインワーカーの workspaces/<repo> や
 * プロセスの cwd へは決してフォールバックしない。準備できなければ例外を投げる。
 */
export async function prepareChatWorkspace(
  repo: string | undefined,
  cfg: Config | undefined,
  refresh: boolean,
  emit?: EventCallback,
  git?: GitRunner,
): Promise<string> {
  if (!cfg) throw new Error("設定が渡されていないため Chat 用ワークスペースを準備できません");
  const targetRepo = repo || "k-wa-wa/nuage-autopilot4";
  await emit?.({
    event: "thought",
    data: {
      delta: refresh
        ? `調査用ワークスペース (${targetRepo}) を最新化中...\n`
        : `調査用ワークスペース (${targetRepo}) を使用します\n`,
    },
  });
  return await ensureChatWorkspace(cfg, targetRepo, { refresh }, git);
}

/**
 * 改行区切り JSON ストリームのパース共通ヘルパー
 */
export async function processJsonStream(
  readable: ReadableStream<Uint8Array>,
  onLine: (parsed: Record<string, unknown>) => Promise<void> | void,
): Promise<void> {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        await onLine(parsed);
      } catch {
        // 不正な JSON 行はスキップ
      }
    }
  }
}

/**
 * 本番 claude CLI とのストリーミング連携
 */
export async function streamClaudeResponse(
  emit: EventCallback,
  card?: CardContext,
  userMessage?: string,
  conversationId?: string,
  cfg?: Config,
  env?: AutopilotEnvironment,
  mode: ChatMode = "investigate",
): Promise<void> {
  let cwd: string;
  try {
    cwd = await prepareChatWorkspace(card?.repo, cfg, !conversationId, emit);
  } catch (err) {
    await emit({
      event: "error",
      data: { message: `ワークスペース準備に失敗しました: ${String(err)}` },
    });
    return;
  }
  const prompt = buildInvestigatePrompt({ card, userMessage, env, mode });

  const { argv } = buildChatInvocation(
    { command: "claude", timeout_sec: 0 },
    {
      prompt,
      conversationId:
        conversationId && !conversationId.startsWith("mock-") ? conversationId : undefined,
    },
  );

  try {
    const proc = Bun.spawn(argv, {
      stdout: "pipe",
      stderr: "pipe",
      cwd,
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
      },
    });

    // tool_use の input は content_block_start 時点では空で、input_json_delta で
    // 少しずつ届く。content_block_stop で確定するまでブロック index ごとに貯める。
    const pendingTools = new Map<number, { id: string; name: string; json: string }>();

    await processJsonStream(proc.stdout, async (parsed) => {
      if (parsed.session_id && parsed.type === "system" && parsed.status === "requesting") {
        await emit({
          event: "init",
          data: {
            conversation_id: parsed.session_id as string,
            engine: "claude",
          },
        });
      } else if (parsed.type === "stream_event") {
        const ev = parsed.event as
          | {
              type?: string;
              index?: number;
              content_block?: { type?: string; id?: string; name?: string; input?: unknown };
              delta?: { type?: string; thinking?: string; text?: string; partial_json?: string };
            }
          | undefined;

        if (ev?.type === "content_block_start") {
          const cb = ev.content_block;
          if (cb?.type === "tool_use" && typeof ev.index === "number") {
            pendingTools.set(ev.index, { id: cb.id ?? "", name: cb.name || "tool", json: "" });
          }
        } else if (ev?.type === "content_block_delta") {
          const d = ev.delta;
          if (d?.type === "thinking_delta") {
            await emit({ event: "thought", data: { delta: d.thinking || d.text || "" } });
          } else if (d?.type === "text_delta") {
            await emit({ event: "text", data: { delta: d.text || "" } });
          } else if (d?.type === "input_json_delta" && typeof ev.index === "number") {
            const pending = pendingTools.get(ev.index);
            if (pending) pending.json += d.partial_json ?? "";
          }
        } else if (ev?.type === "content_block_stop" && typeof ev.index === "number") {
          const pending = pendingTools.get(ev.index);
          if (pending) {
            pendingTools.delete(ev.index);
            let args: unknown;
            try {
              args = pending.json ? JSON.parse(pending.json) : undefined;
            } catch {
              args = undefined;
            }
            await emit({ event: "tool_start", data: { id: pending.id, name: pending.name, args } });
          }
        }
      } else if (parsed.type === "result") {
        await emit({
          event: "done",
          data: {
            status: "SUCCESS",
            conversation_id: parsed.session_id as string | undefined,
            usage: parsed.usage,
          },
        });
      }
    });

    await proc.exited;
  } catch (err) {
    await emit({ event: "error", data: { message: String(err) } });
  }
}

/**
 * 本番 agy CLI とのストリーミング連携
 * （一旦 autopilot chat から利用できるエージェントは claude に絞るためコメントアウト。後で agy 展開時に復帰する）
 */
/*
export async function streamAgyResponse(
  emit: EventCallback,
  card?: CardContext,
  userMessage?: string,
  conversationId?: string,
  cfg?: Config,
  env?: AutopilotEnvironment,
  mode: ChatMode = "investigate",
): Promise<void> {
  let cwd: string;
  try {
    cwd = await prepareChatWorkspace(card?.repo, cfg, !conversationId, emit);
  } catch (err) {
    await emit({
      event: "error",
      data: { message: `ワークスペース準備に失敗しました: ${String(err)}` },
    });
    return;
  }
  const prompt = buildInvestigatePrompt({ card, userMessage, env, mode });

  const { argv } = buildChatInvocation(
    { command: "agy", timeout_sec: 0 },
    {
      prompt,
      conversationId:
        conversationId && !conversationId.startsWith("mock-") ? conversationId : undefined,
    },
  );

  try {
    const proc = Bun.spawn(argv, {
      stdout: "pipe",
      stderr: "pipe",
      cwd,
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
      },
    });

    await processJsonStream(proc.stdout, async (parsed) => {
      if (parsed.event === "init") {
        const initData = parsed.init as { tools?: unknown } | undefined;
        await emit({
          event: "init",
          data: {
            conversation_id: parsed.conversation_id as string | undefined,
            tools: initData?.tools,
            engine: "agy",
          },
        });
      } else if (parsed.event === "step_update") {
        const step = parsed.step_update as
          | {
              step_index?: number;
              state?: string;
              step_type?: string;
              text_delta?: string;
              thought?: string;
              tool_name?: string;
              tool_info?: { name?: string; parameters?: unknown };
            }
          | undefined;

        if (step?.step_type === "agent_response" && step.text_delta) {
          await emit({ event: "text", data: { delta: step.text_delta } });
        } else if (step?.thought) {
          await emit({ event: "thought", data: { delta: step.thought } });
        } else if (step?.step_type === "tool" && step.state === "ACTIVE") {
          // agy は同じツール呼び出しを ACTIVE → DONE の2回送ってくるため、
          // 完了タイミングは追わず ACTIVE 時点の呼び出し内容だけを表示する。
          await emit({
            event: "tool_start",
            data: {
              id: step.step_index !== undefined ? String(step.step_index) : step.tool_name,
              name: step.tool_name || step.tool_info?.name || "tool",
              args: step.tool_info?.parameters,
            },
          });
        }
      } else if (parsed.event === "result") {
        const res = parsed.result as
          | { status?: string; conversation_id?: string; usage?: unknown }
          | undefined;
        await emit({
          event: "done",
          data: {
            status: res?.status,
            conversation_id: res?.conversation_id,
            usage: res?.usage,
          },
        });
      }
    });

    await proc.exited;
  } catch (err) {
    await emit({ event: "error", data: { message: String(err) } });
  }
}
*/
