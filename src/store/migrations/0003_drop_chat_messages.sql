-- チャットメッセージをClaudeセッションJSONLから直接参照する方式へ移行。
-- DB側の個別メッセージ保存テーブルを削除し、会話メタデータにセッションファイルパスを追加する。

DROP TABLE IF EXISTS chat_messages;

ALTER TABLE chat_conversations ADD COLUMN session_file_path TEXT NOT NULL DEFAULT '';
