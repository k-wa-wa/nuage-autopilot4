import { Hono } from "hono";
import { mountApiRoutes } from "../api/routes.ts";
import { buildDoneState, buildState } from "../api/state.ts";
import type { DB } from "../store/db.ts";
import { getClientBundle } from "./bundle.ts";
import { DonePage } from "./done.tsx";
import { Page } from "./page.tsx";

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
  // 1. API ルート群 (/api/*)
  mountApiRoutes(app, db);

  // 2. クライアントスクリプト配信 (JS バンドル)
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

  // 完了ページ（クローズ済みをリポジトリごとに表示）
  app.get("/done", (c) =>
    c.html(
      `<!doctype html>${<DonePage state={buildDoneState(db)} health={buildState(db).health} />}`,
    ),
  );

  // 初期ロード（SSR: サーバーサイドで初期カードを展開して返す）
  app.get("/", (c) => {
    const state = buildState(db);
    return c.html(`<!doctype html>${<Page initialState={state} />}`);
  });

  const server = Bun.serve({ port, hostname, fetch: app.fetch });
  return { stop: () => server.stop(true) };
}
