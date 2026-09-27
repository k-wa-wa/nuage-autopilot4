import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { Config } from "../config.ts";
import type { CardContext, ChatPayload } from "../execute/chat/index.ts";
import { streamChat } from "../execute/chat/index.ts";
import { loadClaudeSession, resolveClaudeSessionPath } from "../execute/chat/session.ts";
import { getConversation, listConversations, upsertConversation } from "../store/chat.ts";
import type { DB } from "../store/db.ts";

export type { CardContext, ChatPayload };

/**
 * Hono ハンドラ: POST /api/chat (SSE ストリーミング & 会話永続化)
 *
 * 画面分割パネル（AI 調査・壁打ちアシスタント）からのリクエストを受け取り、
 * execute 層のエージェント実行ストリームを SSE に中継しながら、
 * 会話セッションのメタデータ（および Claude セッションファイルパス）を SQLite DB に自動保存する。
 * 会話メッセージ自体は Claude のセッション JSONL から直接参照される。
 */
export function createChatStreamHandler(db: DB, cfg?: Config) {
  return async (c: Context) => {
    let payload: ChatPayload = {};
    try {
      payload = await c.req.json<ChatPayload>();
    } catch {
      // 空ボディ許容
    }

    const card = payload.card;

    // 会話 ID の初期決定（指定がなければ新規 UUID）
    let activeConversationId = payload.conversation_id || randomUUID();

    const mode = (payload.mode as "investigate" | "brainstorm") || "investigate";
    const engine = (payload.engine as "claude" | "agy") || "claude";
    const userPrompt = payload.message?.trim() || "";

    return streamSSE(c, async (stream) => {
      // 中間プロキシ（Ingress / Cloudflare 等）やネットワーク切断を防ぐための定期ハートビート
      let isStreamClosed = false;
      const heartbeatTimer = setInterval(async () => {
        if (isStreamClosed) return;
        try {
          await stream.writeSSE({ event: "ping", data: "{}" });
        } catch {
          isStreamClosed = true;
          clearInterval(heartbeatTimer);
        }
      }, 5000);

      stream.onAbort(() => {
        isStreamClosed = true;
        clearInterval(heartbeatTimer);
      });

      try {
        await streamChat(
          {
            card,
            message: payload.message,
            conversationId: payload.conversation_id,
            engine,
            mode,
            cfg,
          },
          async (ev) => {
            // 1. init イベント: エージェント CLI から確定 conversation_id を取得
            if (ev.event === "init") {
              const data = ev.data as { conversation_id?: string; engine?: string };
              if (data?.conversation_id) {
                activeConversationId = data.conversation_id;
              }

              const sessionFilePath =
                resolveClaudeSessionPath(activeConversationId, card?.repo, cfg) ?? "";
              const title =
                userPrompt.slice(0, 50) ||
                (card ? `${card.repo}#${card.issue_number} の調査` : "Autopilot Chat");

              upsertConversation(db, {
                id: activeConversationId,
                mode,
                engine,
                title,
                sessionFilePath,
              });

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

            // 2. done イベント: セッションパスを最終確定・更新
            if (ev.event === "done") {
              const data = ev.data as { conversation_id?: string };
              if (data?.conversation_id) {
                activeConversationId = data.conversation_id;
              }

              const sessionFilePath =
                resolveClaudeSessionPath(activeConversationId, card?.repo, cfg) ?? "";

              upsertConversation(db, {
                id: activeConversationId,
                mode,
                engine,
                title: userPrompt.slice(0, 50) || "Autopilot Chat",
                sessionFilePath,
              });

              await stream.writeSSE({
                event: ev.event,
                data: JSON.stringify({
                  ...ev.data,
                  conversation_id: activeConversationId,
                }),
              });
              return;
            }

            // その他のイベント（text, thought, tool_start 等）はそのままストリーミング
            await stream.writeSSE({
              event: ev.event,
              data: JSON.stringify(ev.data),
            });
          },
        );
      } finally {
        isStreamClosed = true;
        clearInterval(heartbeatTimer);
      }
    });
  };
}

/**
 * Hono ハンドラ: GET /api/chat/conversations
 * 過去の会話一覧を取得する（更新日時降順、全体）。
 */
export function createListConversationsHandler(db: DB) {
  return (c: Context) => {
    const list = listConversations(db);
    return c.json({ conversations: list });
  };
}

/**
 * Hono ハンドラ: GET /api/chat/conversations/:id
 * 会話メタデータおよび Claude セッション JSONL から復元したメッセージ履歴を取得する。
 */
export function createGetConversationHandler(db: DB, cfg?: Config) {
  return (c: Context) => {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "id is required" }, 400);
    }

    const conv = getConversation(db, id);
    if (!conv) {
      return c.json({ error: "conversation not found" }, 404);
    }

    // セッションファイルパスを解決
    const sessionFilePath = conv.session_file_path || resolveClaudeSessionPath(id, undefined, cfg);

    // 未登録だった場合は DB にセッションファイルパスを反映
    if (sessionFilePath && !conv.session_file_path) {
      upsertConversation(db, {
        id: conv.id,
        mode: conv.mode,
        engine: conv.engine,
        title: conv.title,
        sessionFilePath,
      });
    }

    const messages = sessionFilePath ? loadClaudeSession(sessionFilePath) : [];
    return c.json({ conversation: conv, messages });
  };
}
