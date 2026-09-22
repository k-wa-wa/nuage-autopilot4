import { Hono } from "hono";
import { mountApiRoutes } from "../api/routes.ts";
import { buildDoneState, buildState } from "../api/state.ts";
import type { DB } from "../store/db.ts";
import { getClientBundle } from "./bundle.ts";
import { renderDocument } from "./document.tsx";

/**
 * Dashboard（spec.md §10）。
 *
 * 書き込み API を持たない。承認・指示・マージはすべて GitHub 側で行う。
 * 承認ボタンを置くと、GitHub のコメント履歴に残らない指示経路が生まれ真実源が二重化する。
 *
 * 認証は持たない。既定は 127.0.0.1 で、host を広げる場合は信頼できるネットワークに限ること。
 * 書き込み経路は無いので影響は「Issue の題名と状態が読まれる」までに閉じている。
 */

/**
 * 本番と dev（モック）で共通のルーティング（API およびクライアント配信）を登録する。
 */
export function mountRoutes(app: Hono, db: DB): void {
  mountApiRoutes(app, db);

  app.get("/client.js", async (c) => {
    const bundle = await getClientBundle();
    return c.text(bundle, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
    });
  });
}

export function startServer(db: DB, port: number, hostname = "127.0.0.1"): { stop: () => void } {
  const app = new Hono();
  mountRoutes(app, db);

  app.get("/done", (c) =>
    c.html(
      renderDocument({ page: "done", done: buildDoneState(db), health: buildState(db).health }),
    ),
  );

  app.get("/", (c) => c.html(renderDocument({ page: "dashboard", state: buildState(db) })));

  const server = Bun.serve({ port, hostname, fetch: app.fetch });
  return { stop: () => server.stop(true) };
}
