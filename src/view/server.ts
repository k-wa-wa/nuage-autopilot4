import { Hono } from "hono";
import type { DB } from "../store/db.ts";
import { buildState } from "./state.ts";
import { PAGE } from "./page.ts";

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

  app.get("/api/state", (c) => c.json(buildState(db)));
  app.get("/api/health", (c) => c.json(buildState(db).health));
  app.get("/", (c) => c.html(PAGE));

  const server = Bun.serve({ port, hostname, fetch: app.fetch });
  return { stop: () => server.stop(true) };
}
