import type { Hono } from "hono";
import type { DB } from "../store/db.ts";
import { renderErrorHistory, renderHistoryTimeline, renderLanes } from "../view/render.tsx";
import { handleChatStream } from "./chat.ts";
import { handleCreateIssue } from "./issue.ts";
import { buildDoneState, buildState, getCard } from "./state.ts";

/**
 * Autopilot HTTP API ルーティング登録。
 *
 * すべての `/api/*` エンドポイントをここに集約する。
 * - /api/state: システム状態（全レーン情報 + health）
 * - /api/health: ヘルス・レートリミット状態
 * - /api/done: 完了済みアイテム一覧
 * - /api/chat: AI 調査・壁打ちアシスタント (SSE ストリーミング)
 * - /api/issue/create: GitHub Issue 起票
 * - /api/render/*: レーンおよび履歴・エラー HTML 片（後方互換）
 */
export function mountApiRoutes(app: Hono, db: DB): void {
  // 状態データ JSON API
  app.get("/api/state", (c) => c.json(buildState(db)));
  app.get("/api/health", (c) => c.json(buildState(db).health));
  app.get("/api/done", (c) => c.json(buildDoneState(db)));

  // HTML 片レンダリング API（後方互換用）
  app.get("/api/render/lanes", (c) => c.json(renderLanes(buildState(db))));

  app.get("/api/render/history", (c) => {
    const repo = c.req.query("repo");
    const issueStr = c.req.query("issue");
    if (!repo || !issueStr) {
      return c.json({ error: "repo and issue are required" }, 400);
    }
    const target = getCard(db, repo, Number.parseInt(issueStr, 10));
    return c.json({
      timeline_html: renderHistoryTimeline(target?.job_history),
    });
  });

  app.get("/api/render/error", (c) => {
    const repo = c.req.query("repo");
    const issueStr = c.req.query("issue");
    if (!repo || !issueStr) {
      return c.json({ error: "repo and issue are required" }, 400);
    }
    const target = getCard(db, repo, Number.parseInt(issueStr, 10));
    return c.json({
      error_history_html: renderErrorHistory(target?.error_history),
    });
  });

  // AI 調査アシスタント (SSE ストリーミング)
  app.post("/api/chat", handleChatStream);

  // GitHub Issue 起票 API (壁打ちモード等からの連携)
  app.post("/api/issue/create", handleCreateIssue);
}
