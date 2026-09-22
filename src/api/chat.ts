import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { CardContext, InvestigatePayload } from "../execute/investigate.ts";
import { streamInvestigate } from "../execute/investigate.ts";
import {
  addChatMessage,
  getConversation,
  listChatMessages,
  listConversations,
  upsertConversation,
} from "../store/chat.ts";
import type { DB } from "../store/db.ts";

export type { CardContext, InvestigatePayload };

/**
 * Hono ハンドラ: POST /api/chat (SSE ストリーミング & 会話永続化)
 *
 * 画面分割パネル（AI 調査・壁打ちアシスタント）からのリクエストを受け取り、
 * execute 層のエージェント実行ストリームを SSE に中継しながら、
 * 会話セッションおよびメッセージ履歴を SQLite DB に自動保存する。
 */
export function createChatStreamHandler(db: DB) {
  return async (c: Context) => {
    let payload: InvestigatePayload = {};
    try {
      payload = await c.req.json<InvestigatePayload>();
    } catch {
      // 空ボディ許容
    }

    const card = payload.card;
    const repo = card?.repo ?? "";
    const issueNumber = card?.issue_number ?? 0;
    const mode = (payload.mode as "investigate" | "brainstorm") || "investigate";
    const engine = (payload.engine as "claude" | "agy") || "agy";
    const userPrompt = payload.message?.trim() || "";

    // 会話 ID の初期決定（指定がなければ新規 UUID）
    let activeConversationId = payload.conversation_id || randomUUID();
    let isUserMessageSaved = false;
    let accumulatedAssistantText = "";

    return streamSSE(c, async (stream) => {
      await streamInvestigate(
        {
          card,
          message: payload.message,
          conversationId: payload.conversation_id,
          engine,
          mode,
        },
        async (ev) => {
          // 1. init イベント: エージェント CLI から確定 conversation_id を取得
          if (ev.event === "init") {
            const data = ev.data as { conversation_id?: string; engine?: string };
            if (data?.conversation_id) {
              activeConversationId = data.conversation_id;
            }

            // 会話レコードを DB に確保
            const title =
              userPrompt.slice(0, 50) ||
              (card ? `${repo}#${issueNumber} の調査` : "Autopilot Chat");
            upsertConversation(db, {
              id: activeConversationId,
              repo,
              issueNumber,
              mode,
              engine,
              title,
            });

            // ユーザー発言を記録
            if (!isUserMessageSaved && userPrompt) {
              addChatMessage(db, {
                conversationId: activeConversationId,
                role: "user",
                content: userPrompt,
              });
              isUserMessageSaved = true;
            }

            // クライアント側へ確定した conversation_id を伝える
            await stream.writeSSE({
              event: ev.event,
              data: JSON.stringify({
                ...ev.data,
                conversation_id: activeConversationId,
              }),
            });
            return;
          }

          // 2. text イベント: 回答テキストを蓄積
          if (ev.event === "text") {
            const data = ev.data as { delta?: string };
            if (data?.delta) {
              accumulatedAssistantText += data.delta;
            }
          }

          // 3. done イベント: アシスタントの最終回答を保存
          if (ev.event === "done") {
            const data = ev.data as { conversation_id?: string };
            if (data?.conversation_id) {
              activeConversationId = data.conversation_id;
            }

            // 万一 init で保存されていなければここで確保
            upsertConversation(db, {
              id: activeConversationId,
              repo,
              issueNumber,
              mode,
              engine,
              title: userPrompt.slice(0, 50) || "Autopilot Chat",
            });

            if (!isUserMessageSaved && userPrompt) {
              addChatMessage(db, {
                conversationId: activeConversationId,
                role: "user",
                content: userPrompt,
              });
              isUserMessageSaved = true;
            }

            if (accumulatedAssistantText) {
              addChatMessage(db, {
                conversationId: activeConversationId,
                role: "assistant",
                content: accumulatedAssistantText,
              });
            }

            await stream.writeSSE({
              event: ev.event,
              data: JSON.stringify({
                ...ev.data,
                conversation_id: activeConversationId,
              }),
            });
            return;
          }

          // その他のイベント（thought, tool_start 等）はそのままストリーミング
          await stream.writeSSE({
            event: ev.event,
            data: JSON.stringify(ev.data),
          });
        },
      );
    });
  };
}

/**
 * Hono ハンドラ: GET /api/chat/conversations
 * 特定カード（または全体）の過去の会話一覧を取得する。
 */
export function createListConversationsHandler(db: DB) {
  return (c: Context) => {
    const repo = c.req.query("repo") ?? "";
    const issueStr = c.req.query("issue");
    const issueNumber = issueStr ? Number.parseInt(issueStr, 10) || 0 : 0;

    const list = listConversations(db, repo, issueNumber);
    return c.json({ conversations: list });
  };
}

/**
 * Hono ハンドラ: GET /api/chat/conversations/:id
 * 会話メタデータおよびメッセージ履歴を取得する。
 */
export function createGetConversationHandler(db: DB) {
  return (c: Context) => {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "id is required" }, 400);
    }

    const conv = getConversation(db, id);
    if (!conv) {
      return c.json({ error: "conversation not found" }, 404);
    }

    const messages = listChatMessages(db, id);
    return c.json({ conversation: conv, messages });
  };
}
