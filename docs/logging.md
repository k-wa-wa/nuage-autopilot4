# ログ仕様 (Logging)

常駐デーモン（`autopilot run`）のログ方針。過不足なく進捗を追跡し、ログスパムを防ぐ。

---

## 1. ログレベル（3 段階）

| レベル | 用途・基準 | 出力先 |
|---|---|---|
| **`error`** | **プロセス停止・即座の人間介入が必要な致命的異常**（設定不備、ロック競合、クラッシュ等） | stderr |
| **`warn`** | **自動回復・リトライされる異常**（ジョブ失敗、タイムアウト、Triage 異常、API エラー等） | stdout / stderr |
| **`info`** | **主要ライフサイクルイベント**（検知、キュー投入、ジョブ開始・終了、同期、起動・停止等） | stdout |

※ `debug` は通常運用では出力しない。

---

## 2. 出力タイミングと例

フォーマット: `YYYY-MM-DDTHH:mm:ssZ [LEVEL] [repo#issue:] MESSAGE`

- **収集（Collect）**:
  - `[info] owner/repo#42: detected new comment by @alice`（差分検知時のみ）
  - `[warn] owner/repo: poll failed (rate_limited | forbidden)`
- **判定・キュー（Decide / Queue）**:
  - `[info] owner/repo#42: enqueue implement (comment:12345)`（全経路で統一出力）
  - `[info] owner/repo#42: sync=issue_closed_by_human` / `fanout 3 children`
  - `[warn] owner/repo#42: triage error (1/3): exit 1`
- **実行（Execute / Worker）**:
  - `[info] owner/repo#42: job 7 (implement) started`
  - `[info] owner/repo#42: job 7 (implement) finished in 45s: SUCCESS (created PR #15)`
  - `[warn] owner/repo#42: job 7 (implement) failed in 600s: TIMEOUT`
  - `[info] owner/repo#42: job 7 (implement) canceled by human`
- **全体**:
  - `[info] autopilot started (dashboard: http://127.0.0.1:4040)` / `shutting down` / `recovered 2 orphaned job(s)`

---

## 3. ログを出さないもの（ログスパム防止）

- **無変化の周期処理**: 差分なしのポーリング、Tick / Worker の空振り、定期ハートビート。
- **長文・自由入力テキスト**: 大方針として Issue/PR 本文・コメント本文・プロンプト・生エラーログ等の自由入力は標準ログに出さず、`$AUTOPILOT_HOME/logs/...` や DB に記録する。
- **機密情報**: トークン類は必ずマスク（`***REDACTED***`）する。
