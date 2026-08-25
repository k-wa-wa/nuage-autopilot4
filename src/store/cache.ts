import type { DB } from "./db.ts";
import { nowIso } from "../types.ts";

export type ItemKind = "issue" | "pull_request";

export interface CacheRow {
  repo: string;
  item_type: ItemKind;
  number: number;
  node_id: string;
  fingerprint: string;
  payload_json: string | null;
  payload_hash: string | null;
  github_updated_at: string;
}

export function getFingerprint(db: DB, repo: string, kind: ItemKind, number: number): string | null {
  const r = db.query("SELECT fingerprint FROM github_cache WHERE repo=? AND item_type=? AND number=?")
    .get(repo, kind, number) as { fingerprint: string } | null;
  return r?.fingerprint ?? null;
}

export function getCached(db: DB, repo: string, kind: ItemKind, number: number): CacheRow | null {
  return db.query("SELECT * FROM github_cache WHERE repo=? AND item_type=? AND number=?")
    .get(repo, kind, number) as CacheRow | null;
}

/** Phase 1 の結果。fingerprint と node_id だけを更新する。 */
export function upsertFingerprint(
  db: DB, repo: string, kind: ItemKind, number: number, nodeId: string, fp: string, updatedAt: string,
): void {
  db.query(`
    INSERT INTO github_cache (repo, item_type, number, node_id, fingerprint, github_updated_at, synced_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(repo, item_type, number) DO UPDATE SET
      node_id = excluded.node_id, fingerprint = excluded.fingerprint,
      github_updated_at = excluded.github_updated_at, synced_at = excluded.synced_at
  `).run(repo, kind, number, nodeId, fp, updatedAt, nowIso());
}

/**
 * Phase 2 の結果。payload_hash が前回と同一なら false を返す（Triage を起動しない）。
 */
export function upsertDetail(
  db: DB, repo: string, kind: ItemKind, number: number, nodeId: string,
  payload: unknown, updatedAt: string,
): boolean {
  const json = JSON.stringify(payload);
  const hash = Bun.hash(json).toString(16);
  const prev = db.query("SELECT payload_hash FROM github_cache WHERE repo=? AND item_type=? AND number=?")
    .get(repo, kind, number) as { payload_hash: string | null } | null;
  db.query(`
    INSERT INTO github_cache (repo, item_type, number, node_id, fingerprint, payload_json, payload_hash,
                              github_updated_at, synced_at, detail_synced_at)
    VALUES (?,?,?,?,'',?,?,?,?,?)
    ON CONFLICT(repo, item_type, number) DO UPDATE SET
      payload_json = excluded.payload_json, payload_hash = excluded.payload_hash,
      github_updated_at = excluded.github_updated_at, detail_synced_at = excluded.detail_synced_at
  `).run(repo, kind, number, nodeId, json, hash, updatedAt, nowIso(), nowIso());
  return prev?.payload_hash !== hash;
}

/** 親の完了集約のため、次周期の Phase 2 に強制的に載せる（spec.md §3）。 */
export function clearFingerprint(db: DB, repo: string, number: number): void {
  db.query("UPDATE github_cache SET fingerprint = '' WHERE repo=? AND item_type='issue' AND number=?")
    .run(repo, number);
}

export function payload<T = unknown>(db: DB, repo: string, kind: ItemKind, number: number): T | null {
  const r = db.query("SELECT payload_json FROM github_cache WHERE repo=? AND item_type=? AND number=?")
    .get(repo, kind, number) as { payload_json: string | null } | null;
  return r?.payload_json ? (JSON.parse(r.payload_json) as T) : null;
}
