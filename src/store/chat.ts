import type { DB } from "./db.ts";

export interface ChatConversation {
  id: string;
  repo: string;
  issue_number: number;
  mode: "investigate" | "brainstorm";
  engine: "claude" | "agy";
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface CreateConversationParams {
  id: string;
  repo?: string;
  issueNumber?: number;
  mode: "investigate" | "brainstorm";
  engine: "claude" | "agy";
  title?: string;
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

  db.query(
    `INSERT INTO chat_conversations (id, repo, issue_number, mode, engine, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       mode = excluded.mode,
       engine = excluded.engine,
       title = CASE WHEN excluded.title != '' THEN excluded.title ELSE chat_conversations.title END,
       updated_at = excluded.updated_at`,
  ).run(params.id, repo, issueNumber, params.mode, params.engine, title, now, now);

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

/**
 * 会話に新しいメッセージを追加する。
 */
export function addChatMessage(
  db: DB,
  params: { conversationId: string; role: "user" | "assistant"; content: string },
): ChatMessage {
  const now = nowIsoMs();
  const res = db
    .query(
      `INSERT INTO chat_messages (conversation_id, role, content, created_at)
       VALUES (?, ?, ?, ?)
       RETURNING id, conversation_id, role, content, created_at`,
    )
    .get(params.conversationId, params.role, params.content, now) as ChatMessage;

  // 会話の更新日時を更新
  db.query("UPDATE chat_conversations SET updated_at = ? WHERE id = ?").run(
    now,
    params.conversationId,
  );

  return res;
}

/**
 * 会話のメッセージ履歴を時系列昇順で取得する。
 */
export function listChatMessages(db: DB, conversationId: string): ChatMessage[] {
  return db
    .query("SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC")
    .all(conversationId) as ChatMessage[];
}
