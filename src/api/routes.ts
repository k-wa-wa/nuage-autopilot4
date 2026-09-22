import type { Hono } from "hono";
import type { DB } from "../store/db.ts";
import {
  createChatStreamHandler,
  createGetConversationHandler,
  createListConversationsHandler,
} from "./chat.ts";
import { handleCreateIssue } from "./issue.ts";
import { buildDoneState, buildState } from "./state.ts";

/**
 * Autopilot HTTP API ルーティング登録。
 *
 * すべての `/api/*` エンドポイントをここに集約する。
 * - /api/state: システム状態（全レーン情報 + health）
 * - /api/health: ヘルス・レートリミット状態
 * - /api/done: 完了済みアイテム一覧
 * - /api/chat: AI 調査・壁打ちアシスタント (SSE ストリーミング & 永続化)
 * - /api/chat/conversations: 会話セッション一覧
 * - /api/chat/conversations/:id: 会話詳細・メッセージ履歴
 * - /api/issue/create: GitHub Issue 起票
 */
export function mountApiRoutes(app: Hono, db: DB): void {
  // 状態データ JSON API
  app.get("/api/state", (c) => c.json(buildState(db)));
  app.get("/api/health", (c) => c.json(buildState(db).health));
  app.get("/api/done", (c) => c.json(buildDoneState(db)));

  // AI 調査アシスタント (SSE ストリーミング & 永続化)
  app.post("/api/chat", createChatStreamHandler(db));
  app.get("/api/chat/conversations", createListConversationsHandler(db));
  app.get("/api/chat/conversations/:id", createGetConversationHandler(db));

  // GitHub Issue 起票 API (壁打ちモード等からの連携)
  app.post("/api/issue/create", handleCreateIssue);
}
