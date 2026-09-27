-- chat_conversations から repo, issue_number を削除し、会話とカード・リポジトリの紐付けを解除する。
-- 会話履歴を全体で平等に（更新日時降順）取得・表示するためのインデックスを作成。

DROP INDEX IF EXISTS idx_chat_conv_target;

ALTER TABLE chat_conversations DROP COLUMN repo;
ALTER TABLE chat_conversations DROP COLUMN issue_number;

CREATE INDEX idx_chat_conv_updated ON chat_conversations (updated_at DESC);
