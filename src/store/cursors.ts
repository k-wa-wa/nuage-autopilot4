import type { DB } from "./db.ts";

export function getCursor(db: DB, name: string): string | null {
  const r = db.query("SELECT value FROM cursors WHERE name = ?").get(name) as { value: string } | null;
  return r?.value ?? null;
}

/** Phase 1 と Phase 2 の両方が成功した後にのみ呼ぶ（spec.md §5）。 */
export function setCursor(db: DB, name: string, value: string): void {
  db.query("INSERT INTO cursors (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value")
    .run(name, value);
}

export const syncCursorName = (repo: string) => `sync:${repo}`;
