import { Hono } from "hono";
import type { DB } from "../store/db.ts";
import { Page } from "./page.tsx";
import { renderErrorHistory, renderHistoryTimeline, renderLanes } from "./render.tsx";
import { buildState } from "./state.ts";

/**
 * Dashboard（spec.md §10）。
 *
 * 書き込み API を持たない。承認・指示・マージはすべて GitHub 側で行う。
 * 承認ボタンを置くと、GitHub のコメント履歴に残らない指示経路が生まれ真実源が二重化する。
 *
 * 認証は持たない。既定は 127.0.0.1 で、host を広げる場合は信頼できるネットワークに限ること。
 * 書き込み経路は無いので影響は「Issue の題名と状態が読まれる」までに閉じている。
 */
export function startServer(db: DB, port: number, hostname = "127.0.0.1"): { stop: () => void } {
  const app = new Hono();

  // 既存 JSON API（互換性維持・CLI / テスト用）
  app.get("/api/state", (c) => c.json(buildState(db)));
  app.get("/api/health", (c) => c.json(buildState(db).health));

  // HTML 片レンダリング API（Hono JSX 主導フロントエンド用）
  app.get("/api/render/lanes", (c) => c.json(renderLanes(buildState(db))));

  app.get("/api/render/history", (c) => {
    const repo = c.req.query("repo");
    const issueStr = c.req.query("issue");
    if (!repo || !issueStr) {
      return c.json({ error: "repo and issue are required" }, 400);
    }
    const issueNumber = Number.parseInt(issueStr, 10);
    const state = buildState(db);
    const allCards = [
      ...state.lanes.action_required,
      ...state.lanes.working,
      ...state.lanes.queued,
      ...state.lanes.backlog,
    ];
    const target = allCards.find((it) => it.repo === repo && it.issue_number === issueNumber);
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
    const issueNumber = Number.parseInt(issueStr, 10);
    const state = buildState(db);
    const allCards = [
      ...state.lanes.action_required,
      ...state.lanes.working,
      ...state.lanes.queued,
      ...state.lanes.backlog,
    ];
    const target = allCards.find((it) => it.repo === repo && it.issue_number === issueNumber);
    return c.json({
      error_history_html: renderErrorHistory(target?.error_history),
    });
  });

  // 初期ロード（SSR: サーバーサイドで初期カードを展開して返す）
  app.get("/", (c) => {
    const state = buildState(db);
    return c.html(`<!doctype html>${<Page initialState={state} />}`);
  });

  const server = Bun.serve({ port, hostname, fetch: app.fetch });
  return { stop: () => server.stop(true) };
}
