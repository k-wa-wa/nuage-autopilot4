-- Autopilot schema
-- 日時列はすべて UTC ISO8601 TEXT ('YYYY-MM-DDTHH:MM:SSZ')。
-- CURRENT_TIMESTAMP は使わない（スペース区切りになり文字列比較が壊れる）。
-- 現在時刻は strftime('%Y-%m-%dT%H:%M:%SZ', 'now') を使う。


-- 1. GitHub から取得した生データ・キャッシュ（Phase 1 / Phase 2 の両方の状態を保持）
CREATE TABLE github_cache (
    repo                    TEXT NOT NULL,
    item_type               TEXT NOT NULL,        -- 'issue' | 'pull_request'
    number                  INTEGER NOT NULL,
    node_id                 TEXT NOT NULL,        -- Phase 2 の nodes(ids:) で使う GraphQL ID
    fingerprint             TEXT NOT NULL,        -- Phase 1 の変更検知ハッシュ（totalCount 群を含む）
    payload_json            TEXT,                 -- Phase 2 の詳細レスポンス（未取得なら NULL）
    payload_hash            TEXT,                 -- payload_json の正規化ハッシュ（Triage 起動の判定に使う）
    github_updated_at       TEXT NOT NULL,
    synced_at               TEXT NOT NULL,        -- Phase 1 の最終実行時刻
    detail_synced_at        TEXT,                 -- Phase 2 の最終実行時刻
    PRIMARY KEY (repo, item_type, number)
);

-- 2. アイテムの現在地と表示情報
CREATE TABLE items (
    repo                    TEXT NOT NULL,
    issue_number            INTEGER NOT NULL,
    pr_number               INTEGER DEFAULT 0,
    branch                  TEXT DEFAULT '',
    head_sha                TEXT DEFAULT '',
    title                   TEXT DEFAULT '',      -- Dashboard 表示用（payload_json を読まずに済ませる）
    state                   TEXT NOT NULL,        -- ActionRequired | Working | Queued | Done
    display_hint            TEXT DEFAULT '',      -- 値域は state-machine.md §1-1 で閉じている
    state_since             TEXT NOT NULL,        -- 現在の state に入った時刻（放置時間の計測用）
    blocked_from            TEXT DEFAULT '',      -- ActionRequired へ落ちた直前のジョブ＝復帰先
    last_event_at           TEXT DEFAULT '',      -- 処理済みの最新イベント時刻（コメント/レビュー）
    last_event_id           INTEGER DEFAULT 0,    -- 同時刻の tie-break（databaseId）
    retry_count             INTEGER DEFAULT 0,    -- CI/品質評価の自動修正リトライ回数（上限 5）
    triage_fail_count       INTEGER DEFAULT 0,    -- Triage Agent の連続失敗回数（実行エラー・検証NG合算、上限 3）
    recheck_needed          INTEGER DEFAULT 0,    -- 実行中ジョブの所有権等により Triage を保留した印
    ci_since                TEXT,                 -- CI 待ち開始時刻（head_sha 変化でリセット）
    parent_repo             TEXT DEFAULT '',      -- 親 Issue のリポジトリ（Sub-issues 用）
    parent_issue_number     INTEGER DEFAULT 0,    -- 親 Issue 番号（Sub-issues 用）
    sub_issues_total        INTEGER DEFAULT 0,    -- 子 Issue 総数（subIssuesSummary.total）
    sub_issues_completed    INTEGER DEFAULT 0,    -- クローズ済み子 Issue 数（subIssuesSummary.completed）
    triaged                 INTEGER NOT NULL DEFAULT 0, -- Triage/初期同期済みフラグ（新規起票判定用）
    version                 INTEGER NOT NULL DEFAULT 0, -- 楽観ロックの単調増加バージョン
    updated_at              TEXT NOT NULL,
    PRIMARY KEY (repo, issue_number)
);

-- Tick（時間経過だけで動く判定）が毎周期スキャンする対象を絞る
CREATE INDEX idx_items_tick ON items (state, ci_since);
CREATE INDEX idx_items_recheck ON items (recheck_needed) WHERE recheck_needed = 1;
CREATE INDEX idx_items_parent ON items (parent_repo, parent_issue_number) WHERE parent_issue_number > 0;

CREATE UNIQUE INDEX idx_items_pr ON items (repo, pr_number) WHERE pr_number > 0;

-- 3. エージェント実行キュー (リポジトリ単位の直列キュー)
CREATE TABLE job_queue (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    repo                    TEXT NOT NULL,
    issue_number            INTEGER NOT NULL,
    job_type                TEXT NOT NULL,        -- refine | implement | evaluate
    job_context             TEXT NOT NULL,        -- 指示内容・プロンプト・エラーログ
    trigger_key             TEXT NOT NULL,        -- 発火元（comment:<databaseId> / ci:<sha>:<state> 等）
    status                  TEXT NOT NULL,        -- pending | running | completed | failed | canceled
    lease_until             TEXT,                 -- 生存信号（ハートビートで延長）
    worker_pid              INTEGER,
    worker_boot_id          TEXT,                 -- ワーカー起動ごとの UUID（PID 再利用対策）
    attempt_count           INTEGER DEFAULT 0,    -- 孤児回収で再投入された回数（上限 3）
    created_at              TEXT NOT NULL,
    started_at              TEXT,
    completed_at            TEXT
);

CREATE INDEX idx_job_queue_fetch ON job_queue (status, id);
CREATE INDEX idx_job_queue_running ON job_queue (repo, status);
CREATE INDEX idx_job_queue_lease ON job_queue (status, lease_until);
CREATE INDEX idx_job_trigger ON job_queue (repo, issue_number, trigger_key);

-- 同一アイテムに同種の未完了ジョブを二重投入させない（直列ロックとは別に必要）
CREATE UNIQUE INDEX idx_job_dedupe
    ON job_queue (repo, issue_number, job_type)
    WHERE status IN ('pending', 'running');

-- 4. カーソル & 実行ログ
CREATE TABLE cursors (
    name                    TEXT PRIMARY KEY,     -- 'sync:owner/repo'
    value                   TEXT NOT NULL
);

CREATE TABLE runs (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id                  INTEGER NOT NULL REFERENCES job_queue(id),
    repo                    TEXT NOT NULL,
    issue_number            INTEGER NOT NULL,
    job_type                TEXT NOT NULL,
    started_at              TEXT NOT NULL,
    ended_at                TEXT,
    result                  TEXT,                 -- RUNNING | SUCCESS | FAIL | BLOCKED | TIMEOUT
    summary                 TEXT DEFAULT '',      -- 結果ファイルの summary（一行要約）
    next_context            TEXT DEFAULT '',      -- 結果ファイルの next_context（引き継ぎ文脈）
    log_path                TEXT NOT NULL
);

CREATE INDEX idx_runs_item ON runs (repo, issue_number, id DESC);
