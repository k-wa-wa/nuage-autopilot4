import type { DB } from "./db.ts";

export interface ChatConversation {
  id: string;
  mode: "investigate" | "brainstorm";
  engine: "claude" | "agy";
  title: string;
  session_file_path: string;
  created_at: string;
  updated_at: string;
}

export interface CreateConversationParams {
  id: string;
  mode: "investigate" | "brainstorm";
  engine: "claude" | "agy";
  title?: string;
  sessionFilePath?: string;
}

// チャットセッションは同秒内での連続やり取りがあるためミリ秒精度を使用する
function nowIsoMs(): string {
  return new Date().toISOString();
}

/**
 * 会話セッションを新規作成または既存レコードの存在を確認・更新する。
 */
export function upsertConversation(db: DB, params: CreateConversationParams): ChatConversation {
  const now = nowIsoMs();
  const title = params.title ?? "";
  const sessionFilePath = params.sessionFilePath ?? "";

  db.query(
    `INSERT INTO chat_conversations (id, mode, engine, title, session_file_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       mode = excluded.mode,
       engine = excluded.engine,
       title = CASE WHEN excluded.title != '' THEN excluded.title ELSE chat_conversations.title END,
       session_file_path = CASE WHEN excluded.session_file_path != '' THEN excluded.session_file_path ELSE chat_conversations.session_file_path END,
       updated_at = excluded.updated_at`,
  ).run(params.id, params.mode, params.engine, title, sessionFilePath, now, now);

  return getConversation(db, params.id)!;
}

export function getConversation(db: DB, id: string): ChatConversation | null {
  const row = db
    .query("SELECT * FROM chat_conversations WHERE id = ?")
    .get(id) as ChatConversation | null;
  return row ?? null;
}

/**
 * 直近の会話セッションを取得する。
 */
export function getLatestConversation(db: DB): ChatConversation | null {
  const row = db
    .query("SELECT * FROM chat_conversations ORDER BY updated_at DESC, rowid DESC LIMIT 1")
    .get() as ChatConversation | null;
  return row ?? null;
}

/**
 * 会話セッション一覧を取得する（更新日時降順）。
 */
export function listConversations(db: DB, limit = 20): ChatConversation[] {
  return db
    .query("SELECT * FROM chat_conversations ORDER BY updated_at DESC, rowid DESC LIMIT ?")
    .all(limit) as ChatConversation[];
}
