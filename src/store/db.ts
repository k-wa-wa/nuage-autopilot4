import { Database } from "bun:sqlite";
import init0001 from "./migrations/0001_init.sql" with { type: "text" };

export type DB = Database;

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  { version: 1, sql: init0001 },
];

/**
 * 接続し PRAGMA を適用してマイグレーションを昇順に適用する。
 * 他のコンポーネントを起動する前に必ず通す（spec.md §5 / data-model 由来）。
 */
export function openDb(path: string): DB {
  const db = new Database(path, { create: true });
  db.run(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  const current = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (const { version, sql } of MIGRATIONS) {
    if (version <= current) continue;
    db.transaction(() => {
      db.run(sql);
      db.run(`PRAGMA user_version = ${version}`);
    })();
  }
}

/** 楽観ロックの衝突。呼び出し側は再読み込みしてやり直す。 */
export class VersionConflict extends Error {
  constructor(repo: string, issue: number) {
    super(`version conflict: ${repo}#${issue}`);
    this.name = "VersionConflict";
  }
}
