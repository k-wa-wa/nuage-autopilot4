import { Hono } from "hono";
import { mountApiRoutes } from "../api/routes.ts";
import { buildDoneState, buildState } from "../api/state.ts";
import type { Config } from "../config.ts";
import type { DB } from "../store/db.ts";
import { getClientBundle } from "./bundle.ts";
import { renderDocument } from "./document.tsx";

/**
 * Dashboard（spec.md §10）。
 *
 * 承認・指示・マージはすべて GitHub 側で行う。
 * 承認ボタンを置くと、GitHub のコメント履歴に残らない指示経路が生まれ真実源が二重化する。
 *
 * 認証は持たない。既定は 127.0.0.1 で、host を広げる場合は信頼できるネットワークに限ること。
 */

/**
 * 本番と dev（モック）で共通のルーティング（API およびクライアント配信）を登録する。
 * cfg が無いと Chat 専用ワークスペースを用意できず、実機エージェントは起動しない（dev はモック応答）。
 */
export function mountRoutes(app: Hono, db: DB, cfg?: Config): void {
  mountApiRoutes(app, db, cfg);

  app.get("/client.js", async (c) => {
    const bundle = await getClientBundle();
    return c.text(bundle, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
    });
  });
}

export function startServer(db: DB, cfg: Config): { stop: () => void } {
  const app = new Hono();
  mountRoutes(app, db, cfg);

  app.get("/done", (c) =>
    c.html(
      renderDocument({ page: "done", done: buildDoneState(db), health: buildState(db).health }),
    ),
  );

  app.get("/", (c) => c.html(renderDocument({ page: "dashboard", state: buildState(db) })));

  const server = Bun.serve({
    port: cfg.dashboard.port,
    hostname: cfg.dashboard.host,
    fetch: app.fetch,
  });
  return { stop: () => server.stop(true) };
}
