import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { CardContext, InvestigatePayload } from "../execute/investigate.ts";
import { streamInvestigate } from "../execute/investigate.ts";

export type { CardContext, InvestigatePayload };

/**
 * Hono ハンドラ: POST /api/chat (SSE ストリーミング)
 *
 * 画面分割パネル（AI 調査アシスタント）からのリクエストを受け取り、
 * execute 層（investigate.ts）のエージェント実行ストリームを SSE に中継する。
 */
export async function handleChatStream(c: Context) {
  let payload: InvestigatePayload = {};
  try {
    payload = await c.req.json<InvestigatePayload>();
  } catch {
    // 空ボディ許容
  }

  return streamSSE(c, async (stream) => {
    await streamInvestigate(
      {
        card: payload.card,
        message: payload.message,
        conversationId: payload.conversation_id,
        engine: payload.engine,
        mode: payload.mode,
      },
      async (ev) => {
        await stream.writeSSE({
          event: ev.event,
          data: JSON.stringify(ev.data),
        });
      },
    );
  });
}
