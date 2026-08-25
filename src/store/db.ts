import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export type DB = Database;

/**
 * 接続し PRAGMA を適用してマイグレーションを昇順に適用する。
 * 他のコンポーネントを起動する前に必ず通す（spec.md §5 / data-model 由来）。
 */
export function openDb(path: string): DB {
  const db = new Database(path, { create: true });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
  `);
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const current = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (const f of files) {
    const v = Number(f.slice(0, 4));
    if (!Number.isFinite(v) || v <= current) continue;
    db.transaction(() => {
      db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
      db.exec(`PRAGMA user_version = ${v}`);
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
