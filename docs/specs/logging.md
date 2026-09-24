# ログ仕様 (Logging)

常駐デーモン（`autopilot run`）のログ方針。過不足なく進捗を追跡し、ログスパムを防ぐ。

---

## 1. ログレベル（3 段階）

| レベル | 用途・基準 | 出力先 |
|---|---|---|
| **`error`** | **プロセス停止・即座の人間介入が必要な致命的異常**（設定不備、ロック競合、クラッシュ等） | stderr |
| **`warn`** | **自動回復・リトライされる異常**（ジョブ失敗、タイムアウト、Triage 異常、API エラー等） | stdout |
| **`info`** | **主要ライフサイクルイベント**（検知、キュー投入、ジョブ開始・終了、同期、起動・停止等） | stdout |

※ `debug` は通常運用では出力しない。

---

## 2. 出力タイミングと例

フォーマット: `YYYY-MM-DDTHH:mm:ssZ [LEVEL] [repo#issue:] MESSAGE`

- **収集（Collect）**:
  - `[info] owner/repo: cold start seeded`
  - `[warn] owner/repo: poll failed (rate_limited | forbidden)`
- **判定・キュー（Decide / Queue）**:
  - `[info] owner/repo#42: detected new comment by @alice`（未処理の新規イベントがある時のみ。
    種別は `comment` / `review` / `review_comment`。bot 自身の投稿は出さない）
  - `[info] owner/repo#42: enqueue implement (comment:12345)`（全経路で統一出力。括弧内は trigger_key）
  - `[info] owner/repo#42: sync=pr-merged-issue-closed` / `fanout 3 children`
  - `[warn] owner/repo#42: triage error (1/3): exit 1` / `triage invalid (1): bad display_hint: ...`
  - `[warn] owner/repo#42: triage said implement, blocked_from=refine wins`
- **実行（Execute / Worker）**:
  - `[info] owner/repo#42: job 7 (implement) started`
  - `[info] owner/repo#42: job 7 (implement) finished in 45s: SUCCESS (created PR #15)`
  - `[warn] owner/repo#42: job 7 (implement) failed in 600s: TIMEOUT`
  - `[info] owner/repo#42: job 7 (implement) canceled by human`
  - `[info] owner/repo#42: job 7 (evaluate) canceled: evaluate target moved: <sha> -> <sha>`（陳腐化）
- **全体**:
  - `[info] autopilot started (dashboard: http://127.0.0.1:4040)` / `shutting down` / `recovered 2 orphaned job(s)`
  - `[error] another autopilot is already running (pid 123)` / `startup aborted: doctor found fatal problem(s)`
  - `[warn] poll loop: <例外>`（収集 / Tick / Worker 各ループの想定外例外。次周期で自動リトライされる）

---

## 3. ログを出さないもの（ログスパム防止）

- **無変化の周期処理**: 差分なしのポーリング、Tick / Worker の空振り、定期ハートビート。
- **長文・自由入力テキスト**: Issue/PR 本文・コメント本文・プロンプト・エージェントの stdout / stderr は標準ログに出さない。
  失敗の理由（`agent exited with 1`、検証エラー、例外メッセージ、GitHub API のエラー文言など）は診断に必要なため出す。
- **機密情報**: トークン類は必ずマスク（`***REDACTED***`）する。
