# 外部制約事項 (External Constraints)

本システムが従うべき、GitHub API・LLM プロバイダ・ローカル実行環境などの**外部要因による制約と仕様**のまとめ。
各制約に対する具体的な対処は、右列のドキュメントで定める。

---

## 1. GitHub API & プラットフォーム

| 制約 | 内容 | 対処 |
|---|---|---|
| **GraphQL レートリミット** | 5,000 pt/h。コストは「コネクションを満たすのに必要なリクエスト数 ÷ 100（切り上げ）」で決まり、**入れ子コネクションが支配的**。素朴な一括クエリは **実測 5〜8 pt/回**（60 秒周期で 300〜480 pt/h）に達し、10〜16 リポジトリで枯渇する。 | [spec.md](./spec.md) の 2 段フェッチ（Phase 1 は**実測 1 pt**）。平常時は 60 秒固定で、残量低下時のみ抑制する |
| **GraphQL は条件付きリクエスト非対応** | REST の ETag / 304（レート制限を消費しない）は **GraphQL では使えない**（POST のため）。GraphQL 移行によって ETag による節約手段は失われる。 | クエリ縮小と、残量低下時の抑制で代替 |
| **`rateLimit` フィールドはコスト 0** | 実測コスト・残量・リセット時刻を無料で取得できる。 | 全クエリに含め、実測値でチューニングする |
| **REST レートリミット (5,000 req/h)** | GraphQL とは別枠。`gh pr create` やコメント投稿に加え、**エージェント CLI が内部で発行する `gh` コマンド**も同じ枠を消費する。 | `autopilot doctor` で両方の残量を表示 |
| **二次レートリミット** | 短時間の集中アクセスで `Retry-After` 付きの制限がかかる。 | 指数バックオフ |
| **PR レビュー / インラインコメントの `updatedAt` 非連動** | Files changed のインラインコメントやレビュー Submit は `PullRequest.updatedAt` を更新しない。`updatedAt` 差分だけを見る方式では**永久に検知できない**。既存レビュースレッドへの単発返信も `COMMENTED` な `PullRequestReview` を生成するため `reviews.totalCount` で検知できる（実測で確認済み）が、カウンタの取りこぼしを防ぐ必要がある。 | `totalCount` を含むフィンガープリント（[spec.md](./spec.md)） |
| **リアクション・コメント編集の非検知** | 👍 リアクションやコメント本文の編集は `updatedAt` も `totalCount` も動かさない。 | 承認・指示は必ず**新規コメント本文**で行う運用規約 |
| **GraphQL の `id` は順序を持たない** | Base64 の不透明なグローバル ID であり、単調増加しない。「これより新しいコメント」の判定に使えない。 | `createdAt` + `databaseId` で判定（[spec.md](./spec.md)） |
| **`/issues` の番号空間共有** | REST の `GET /issues` は Issue と PR を同じ番号空間で返す。 | GraphQL では `issues` / `pullRequests` が分離しているため問題にならない |
| **Sub-issues API は GA 済み（検証済み）** | `Issue.parent` / `Issue.subIssues` / `Issue.subIssuesSummary` は**プレビューヘッダ無しで利用可能**であることを実測で確認済み。`subIssuesSummary` は `{ total, completed, percentCompleted }` を 1 クエリで返す。 | そのまま利用する（[spec.md](./spec.md)） |
| **`subIssuesSummary.completed` は却下も数える** | `completed` は「CLOSED な子の件数」であり、`stateReason` が `NOT_PLANNED`（却下）の子も**完了として加算される**。実測で total=5 / completed=5 のうち 3 件が NOT_PLANNED の例を確認。 | 完了集約では `stateReason` で `COMPLETED` と `NOT_PLANNED` を区別する（[spec.md](./spec.md)） |
| **クロスリポジトリの親子が実在する** | Sub-issue は別リポジトリの Issue を子にできる。監視対象アカウントで実際に使用されていることを確認済み。 | 子ノードから `repository { nameWithOwner }` を必ず取得（[spec.md](./spec.md)） |
| **GraphQL の部分エラー** | HTTP 200 で `errors` と部分 `data` が同時に返る。部分データを upsert すると欠落が確定する。 | `errors` があれば周期ごとスキップ（[spec.md](./spec.md)） |
| **`states: [OPEN]` の一覧から消える** | マージ／クローズされた PR は OPEN 一覧から**消える**。フィンガープリントは「変化した」ではなく「存在しない」になり、差分検知では終端を確定できない。 | 追跡中の PR が一覧に現れなければ明示的に Phase 2 へ回す（[spec.md](./spec.md)） |
| **`statusCheckRollup` は変化しないと動かない** | CI が `null` / `PENDING` のまま固まると `updatedAt` も `totalCount` も動かない。差分検知だけでは Grace Period も待機上限も**永久に発火しない**。 | 時間だけを見る Tick ループ（[spec.md](./spec.md)） |
| **`statusCheckRollup` は全チェックの集約** | PR に紐づく全チェックの合否が集約される。 | 構造的な必須チェック等はリポジトリの CI 設定側で担保・集約する（[spec.md](./spec.md)） |
| **`databaseId` の採番空間はリソースごと** | Issue コメント / PR コメント / レビューはそれぞれ別の採番空間を持ち、単純な大小比較で横断できない。 | 時刻を主キー、`databaseId` を同時刻の tie-break にする（[spec.md](./spec.md)） |
| **Webhook 受信の制約** | ローカル常駐型では公開エンドポイントが無く、個人アカウントの Projects v2 イベント等も対象外。 | ポーリング方式を採用 |
| **反映の非同期タイムラグ** | `gh pr create` や push の直後、timeline や `statusCheckRollup` への反映に数秒〜数十秒かかり、`null` を返すことがある。 | Grace Period（10 分、[spec.md](./spec.md)）および成果物検証時のリトライ待機（[spec.md](./spec.md)） |
| **`statusCheckRollup` は HEAD 依存** | `commits(last:1)` の rollup は、修正 push 直後には**前のコミットの結果**を返しうる。古い緑を読むと `evaluate` が早期起動する。 | `oid == headRefOid == items.head_sha` の 3 者一致を検証（[spec.md](./spec.md)） |
| **CI が存在しないリポジトリ** | `statusCheckRollup` が恒久的に `null` になり、CI 待ちのまま永久に滞留する。 | Grace Period（10 分）経過後は「CI 未設定」として成功扱い（[spec.md](./spec.md)） |
| **クローズキーワードが無いと Issue は閉じない** | PR をマージしても、本文に `Closes #n` が無ければ Issue は OPEN のまま残り `Done` に落ちない。 | `implement` の成功条件に含める（[spec.md](./spec.md)） |
| **サーバーとのクロックドリフト** | ローカル時計と GitHub 時計のズレで `since` の取りこぼし・重複が起きる。**ジョブの成果物検証を `started_at` との時刻比較で行うと、正常な投稿を取りこぼして `failed` になる。** | `since` はレスポンスの `Date` ヘッダ基準 ＋ 5 分オーバーラップ（[spec.md](./spec.md)）。成果物検証は時刻ではなく `databaseId` で行う（[spec.md](./spec.md)） |

---

## 2. LLM & モデルプロバイダ

| 制約 | 内容 | 対処 |
|---|---|---|
| **トークン従量課金** | Triage / Agent の呼び出しは毎回コストを消費する。無変更時のポーリング、自己発言、定型承認で LLM を呼ぶと空費が積み上がる。 | 多段フィルタ（[spec.md](./spec.md)） |
| **自己トリガーのループ** | Autopilot が人間と同じトークンで投稿すると `author.login` で自他を区別できず、「投稿 ➔ 検知 ➔ 投稿」の無限ループとコスト爆発を招く。 | **専用 bot アカウント**での動作を必須とし、`doctor` で「API 取得した bot が allowlist 外」を起動時に強制検証（[spec.md](./spec.md)） |
| **プロンプトインジェクション** | allowlist は発信者を制限するが、**第三者が書いた Issue 本文やコメントは Triage や実行エージェントのコンテキストに混入する**。 | デリミタ隔離と出力検証（[spec.md](./spec.md), [spec.md](./spec.md)）。プライベートリポジトリを原則とする |
| **出力の非決定性** | 同一スナップショットでも判定が揺れ、状態のフラップやジョブの二重投入が起きうる。 | 実態優先の強制同期、出力検証、冪等インデックス |
| **Triage の失敗は必ず起きる** | タイムアウト・API エラー・JSON パース不能は避けられない。ここでカーソルを進めるか否かを決めておかないと、**毎周期 LLM を呼び続けるコスト爆発**か**指示の取りこぼし**のどちらかが必ず起きる。 | 事象ごとにカーソル前進を規定（[spec.md](./spec.md)） |
| **プロバイダのレートリミット (RPM / TPM)** | 短時間の連続呼び出しは 429 の原因になる。 | リポジトリ間の同時実行数を `queue.max_parallel` で制限（[spec.md](./spec.md)） |
| **OS の引数長制限 (`MAX_ARG_STRLEN`)** | argv で長大なプロンプトを直接渡すと約 128KiB で失敗する。 | stdin 渡し／tmpファイル参照（[spec.md](./spec.md)） |
| **エージェント CLI 自身のタイムアウト** | `agy` の print モードは独自のタイムアウト（既定 5 分）を持つ。ワーカー側の上限だけ延ばしても、**実装ジョブが 5 分で勝手に打ち切られる**。 | アダプタで `--print-timeout` を渡す（[spec.md](./spec.md)） |

---

## 3. bot アカウント運用

Autopilot は**人間とは別の専用 bot アカウント**のトークンで動作する。これが自己トリガーのループを防ぐ唯一の仕組みであり、設定ミスは `doctor` で起動時に弾く（[spec.md](./spec.md)）。

| 制約 | 内容 | 対処 |
|---|---|---|
| **bot アカウントの権限** | bot アカウントは監視対象リポジトリの Collaborator である必要がある。権限不足だと `refine` のコメント投稿や PR 作成が実行時まで失敗しない。 | `doctor` で書き込み権限を事前検証 |
| **bot が作成した PR での CI 発火** | Actions の `GITHUB_TOKEN` で作成した PR は再帰防止のため workflow が発火しないが、bot **ユーザーアカウントの PAT** による作成は通常のユーザー操作として扱われる。ただし発火しない場合、CI 待ちが Grace Period 経過後の「CI 未設定」判定に落ち、品質ゲートが素通りする。 | `doctor` が `.github/workflows/` の有無を報告し、存在するのに 10 分で「CI 未設定」判定に落ちた場合は WARN を出す（[spec.md](./spec.md), [spec.md](./spec.md)） |

---

## 4. Git & ローカル実行環境

| 制約 | 内容 | 対処 |
|---|---|---|
| **Git ワークツリーの単一性** | 同一作業ディレクトリに複数プロセスが同時にチェックアウト・コミットするとインデックスが破損する。 | リポジトリ単位の直列ロック（[spec.md](./spec.md)） |
| **プロセス異常終了時の残骸** | SIGKILL やクラッシュで未コミット変更・未追跡ファイル・中断した rebase が残る。 | 実行前の初期化手順（[spec.md](./spec.md)） |
| **PID の再利用** | OS は PID を再利用するため、PID 単独では「自分のプロセスか」を判定できない。無関係なプロセスを自分だと誤認してリースやロックの判定を誤るリスクがある。 | リースやロック確認は `worker_pid` と `worker_boot_id` の組で判定（[spec.md](./spec.md)） |
| **ローカルマシンの断続性** | スリープ・ネットワーク断・再起動でプロセスが中断される。スリープ中は時計が進むため、単純な `lease_until` 超過判定は誤検知しやすい。 | ハートビート方式のリース ＋ `attempt_count` 上限（[spec.md](./spec.md)） |
| **SQLite に日時型が無い** | `CURRENT_TIMESTAMP`（スペース区切り）と GraphQL の ISO8601（`T` 区切り・`Z` 付き）が混在すると、**文字列比較が静かに壊れる**。 | 全列を UTC ISO8601 TEXT に統一（[spec.md](./spec.md)） |
| **SQLite の同時アクセス** | 既定の journal mode では読み書きが競合し `SQLITE_BUSY` が頻発する。`BEGIN`（deferred）では書き込みロックが取れず TOCTOU が残る。 | WAL ＋ `busy_timeout`、単一文フェッチ（[spec.md](./spec.md)） |
