-- Autopilot chat conversation schema
-- 日時列はすべて UTC ISO8601 TEXT ('YYYY-MM-DDTHH:MM:SSZ')。

CREATE TABLE chat_conversations (
    id                      TEXT PRIMARY KEY,     -- conversation_id (UUID または CLI セッションID)
    repo                    TEXT NOT NULL DEFAULT '',
    issue_number            INTEGER NOT NULL DEFAULT 0,
    mode                    TEXT NOT NULL,        -- 'investigate' | 'brainstorm'
    engine                  TEXT NOT NULL,        -- 'claude' | 'agy'
    title                   TEXT NOT NULL DEFAULT '',
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL
);

CREATE INDEX idx_chat_conv_target ON chat_conversations (repo, issue_number, updated_at DESC);

CREATE TABLE chat_messages (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id         TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role                    TEXT NOT NULL,        -- 'user' | 'assistant'
    content                 TEXT NOT NULL,
    created_at              TEXT NOT NULL
);

CREATE INDEX idx_chat_msg_conv ON chat_messages (conversation_id, id ASC);
