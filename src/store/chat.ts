import type { DB } from "./db.ts";

export interface ChatConversation {
  id: string;
  repo: string;
  issue_number: number;
  mode: "investigate" | "brainstorm";
  engine: "claude" | "agy";
  title: string;
  session_file_path: string;
  created_at: string;
  updated_at: string;
}

export interface CreateConversationParams {
  id: string;
  repo?: string;
  issueNumber?: number;
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
  const repo = params.repo ?? "";
  const issueNumber = params.issueNumber ?? 0;
  const title = params.title ?? "";
  const sessionFilePath = params.sessionFilePath ?? "";

  db.query(
    `INSERT INTO chat_conversations (id, repo, issue_number, mode, engine, title, session_file_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       mode = excluded.mode,
       engine = excluded.engine,
       title = CASE WHEN excluded.title != '' THEN excluded.title ELSE chat_conversations.title END,
       session_file_path = CASE WHEN excluded.session_file_path != '' THEN excluded.session_file_path ELSE chat_conversations.session_file_path END,
       updated_at = excluded.updated_at`,
  ).run(params.id, repo, issueNumber, params.mode, params.engine, title, sessionFilePath, now, now);

  return getConversation(db, params.id)!;
}

export function getConversation(db: DB, id: string): ChatConversation | null {
  const row = db
    .query("SELECT * FROM chat_conversations WHERE id = ?")
    .get(id) as ChatConversation | null;
  return row ?? null;
}

/**
 * 特定のカード（または全体）に紐づく直近の会話セッションを取得する。
 */
export function getLatestConversation(db: DB, repo = "", issueNumber = 0): ChatConversation | null {
  const row = db
    .query(
      "SELECT * FROM chat_conversations WHERE repo = ? AND issue_number = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1",
    )
    .get(repo, issueNumber) as ChatConversation | null;
  return row ?? null;
}

/**
 * 会話セッション一覧を取得する（更新日時降順）。
 */
export function listConversations(
  db: DB,
  repo = "",
  issueNumber = 0,
  limit = 20,
): ChatConversation[] {
  return db
    .query(
      "SELECT * FROM chat_conversations WHERE repo = ? AND issue_number = ? ORDER BY updated_at DESC, rowid DESC LIMIT ?",
    )
    .all(repo, issueNumber, limit) as ChatConversation[];
}
