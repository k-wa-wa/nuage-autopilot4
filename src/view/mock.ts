import { type DB, openDb } from "../store/db.ts";
import { type DisplayHint, type JobType, nowIso, type State } from "../types.ts";
import { runtime } from "./state.ts";

export type ScenarioName = "standard" | "alerts" | "empty" | "dense" | "errors";

export interface ScenarioInfo {
  name: ScenarioName;
  title: string;
  description: string;
}

export const SCENARIOS: ScenarioInfo[] = [
  {
    name: "standard",
    title: "Standard (標準)",
    description: "通常の稼働状態。各レーンに複数カードがあり、システム健全。",
  },
  {
    name: "alerts",
    title: "Alerts (警告・障害)",
    description: "レートリミット低下や監視対象外、ジョブ滞留などのバナー警告とエラーカード。",
  },
  {
    name: "empty",
    title: "Empty (空状態)",
    description: "全レーンが0件のクリーンな状態。",
  },
  {
    name: "dense",
    title: "Dense (大量・長文データ)",
    description: "多数のカード、長文タイトル、長文リポジトリ名でのレイアウト崩れ検証用。",
  },
  {
    name: "errors",
    title: "Errors (判断待ち集中)",
    description: "CI失敗、Triage失敗、助言待ちなどAction Requiredに要判断カードが集中。",
  },
];

export interface MockItemInput {
  repo: string;
  issue_number: number;
  title: string;
  state: State;
  display_hint: DisplayHint;
  pr_number?: number;
  state_since?: string;
  job_type?: JobType;
  started_at?: string;
  queue_position?: number;
  triaged?: number;
  parent_repo?: string;
  parent_issue_number?: number;
  sub_issues_total?: number;
  sub_issues_completed?: number;
}

function pastIso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function futureIso(minutesLater: number): string {
  return new Date(Date.now() + minutesLater * 60_000).toISOString();
}

/**
 * モック用のインメモリ SQLite データベースを構築して指定シナリオのデータを投入する。
 */
export function createMockDb(scenario: ScenarioName = "standard"): {
  db: DB;
  currentScenario: ScenarioName;
} {
  const db = openDb(":memory:");
  loadScenario(db, scenario);
  return { db, currentScenario: scenario };
}

/**
 * 既存のDBをクリアして新しいシナリオのデータを投入する。
 */
export function loadScenario(db: DB, scenario: ScenarioName): void {
  // テーブル初期化（外部キー制約に配慮し runs -> job_queue -> items の順序で削除）
  db.run("DELETE FROM runs");
  db.run("DELETE FROM job_queue");
  db.run("DELETE FROM items");

  // runtime リセット
  runtime.graphqlRemaining = 5000;
  runtime.graphqlLimit = 5000;
  runtime.graphqlResetAt = futureIso(45);
  runtime.restRemaining = 5000;
  runtime.restLimit = 5000;
  runtime.restResetAt = futureIso(50);
  runtime.agentUsages = [
    {
      adapter: "claude",
      command: "claude",
      updatedAt: nowIso(),
      limits: [
        { label: "Session", remainingPct: 37, resetAt: futureIso(109) },
        { label: "Weekly", remainingPct: 94, resetAt: futureIso(8639) },
      ],
    },
    {
      adapter: "agy",
      command: "agy",
      updatedAt: nowIso(),
      limits: [
        { label: "Gemini (5h)", remainingPct: 60, resetAt: futureIso(119) },
        { label: "Gemini (Weekly)", remainingPct: 85, resetAt: futureIso(7199) },
      ],
    },
  ];
  runtime.lastPollAt = nowIso();
  runtime.degraded.clear();

  switch (scenario) {
    case "standard":
      seedStandardScenario(db);
      break;
    case "alerts":
      seedAlertsScenario(db);
      break;
    case "empty":
      seedEmptyScenario(db);
      break;
    case "dense":
      seedDenseScenario(db);
      break;
    case "errors":
      seedErrorsScenario(db);
      break;
    default:
      seedStandardScenario(db);
      break;
  }
}

function insertItem(db: DB, it: MockItemInput): void {
  const t = it.state_since ?? nowIso();
  db.query(`
    INSERT INTO items (
      repo, issue_number, title, state, display_hint, state_since,
      triaged, last_event_at, last_event_id, pr_number, branch, head_sha,
      ci_since, parent_repo, parent_issue_number, sub_issues_total, sub_issues_completed, version, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '', 0, ?, '', '', NULL, ?, ?, ?, ?, 0, ?)
  `).run(
    it.repo,
    it.issue_number,
    it.title,
    it.state,
    it.display_hint,
    t,
    it.triaged ?? 1,
    it.pr_number ?? 0,
    it.parent_repo ?? "",
    it.parent_issue_number ?? 0,
    it.sub_issues_total ?? 0,
    it.sub_issues_completed ?? 0,
    t,
  );

  if (it.state === "Working" && it.job_type) {
    db.query(`
      INSERT INTO job_queue (repo, issue_number, job_type, job_context, trigger_key, status, created_at, started_at, worker_pid, worker_boot_id)
      VALUES (?, ?, ?, 'mock context', 'trig_mock', 'running', ?, ?, 12345, 'boot-mock')
    `).run(it.repo, it.issue_number, it.job_type, t, it.started_at ?? t);
  } else if (it.state === "Queued" && it.job_type) {
    db.query(`
      INSERT INTO job_queue (repo, issue_number, job_type, job_context, trigger_key, status, created_at)
      VALUES (?, ?, ?, 'mock context', 'trig_mock', 'pending', ?)
    `).run(it.repo, it.issue_number, it.job_type, t);
  }
}

function pastIsoSec(secondsAgo: number): string {
  return new Date(Date.now() - secondsAgo * 1000).toISOString();
}

function insertMockRun(
  db: DB,
  r: {
    repo: string;
    issue_number: number;
    job_type: JobType;
    result: string;
    summary: string;
    started_at?: string;
    ended_at?: string;
    next_context?: string;
  },
): void {
  const started = r.started_at ?? pastIso(10);
  const ended = r.ended_at ?? pastIso(5);
  const j = db
    .query(
      `INSERT INTO job_queue (repo, issue_number, job_type, job_context, trigger_key, status, created_at, started_at, completed_at)
       VALUES (?, ?, ?, ?, 'mock_trig', ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      r.repo,
      r.issue_number,
      r.job_type,
      r.summary,
      r.result === "SUCCESS" ? "completed" : "failed",
      started,
      started,
      ended,
    ) as { id: number };

  db.query(
    `INSERT INTO runs (job_id, repo, issue_number, job_type, started_at, ended_at, result, summary, next_context, log_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '/tmp/mock.log')`,
  ).run(
    j.id,
    r.repo,
    r.issue_number,
    r.job_type,
    started,
    ended,
    r.result,
    r.summary,
    r.next_context ?? "",
  );
}

function seedStandardScenario(db: DB): void {
  runtime.graphqlRemaining = 4820;
  runtime.graphqlLimit = 5000;
  runtime.graphqlResetAt = futureIso(38);
  runtime.restRemaining = 4950;
  runtime.restLimit = 5000;
  runtime.restResetAt = futureIso(42);
  runtime.lastPollAt = pastIso(1);

  // 🧑 Action Required（新しい順に並ぶ）
  // 1. [マージ待ち・本番再現] nuage-cluster#40 (マルチステップ・リトライ経由で成功)
  insertItem(db, {
    repo: "k-wa-wa/nuage-cluster",
    issue_number: 40,
    title: "Kubernetes マニフェスト修正および Argo CD 自動同期対応",
    state: "ActionRequired",
    display_hint: "マージ待ち",
    pr_number: 41,
    state_since: pastIso(3),
  });
  // 履歴（過去順に挿入 -> id DESC で最新順になる）
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-cluster",
    issue_number: 40,
    job_type: "implement",
    result: "SUCCESS",
    summary:
      "Kubernetes マニフェスト修正とドキュメント更新を完了しました。Argo CD 自動同期に対応する kustomize 設定を追加。",
    next_context: "PR #41 の自動CI評価待ち",
    started_at: pastIsoSec(80 * 60),
    ended_at: pastIsoSec(80 * 60 - 336), // 所要 336s (5m 36s)
  });
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-cluster",
    issue_number: 40,
    job_type: "evaluate",
    result: "FAIL",
    summary: "Evaluation failed: process exited with code 2 (引数フォーマット不整合)",
    started_at: pastIsoSec(75 * 60),
    ended_at: pastIsoSec(75 * 60 - 1), // 所要 1s
  });
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-cluster",
    issue_number: 40,
    job_type: "evaluate",
    result: "FAIL",
    summary:
      "Evaluation failed: result file /tmp/autopilot-result.json not found (非対話セッション終了)",
    started_at: pastIsoSec(70 * 60),
    ended_at: pastIsoSec(70 * 60 - 63), // 所要 63s
  });
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-cluster",
    issue_number: 40,
    job_type: "evaluate",
    result: "SUCCESS",
    summary:
      "PRレビュー完了: merge_ready。すべてのCIチェックに合格し、設計通りの修正が確認できました。",
    next_context: "レビュー承認済み。人間によるマージ操作を待機中。",
    started_at: pastIsoSec(10 * 60),
    ended_at: pastIsoSec(10 * 60 - 86), // 所要 86s
  });

  // 2. [マージ待ち・本番再現] bare-web-proxy#7
  insertItem(db, {
    repo: "k-wa-wa/bare-web-proxy",
    issue_number: 7,
    title: "リバースプロキシのルーティング設定およびSSL終端処理",
    state: "ActionRequired",
    display_hint: "マージ待ち",
    pr_number: 8,
    state_since: pastIso(5),
  });
  insertMockRun(db, {
    repo: "k-wa-wa/bare-web-proxy",
    issue_number: 7,
    job_type: "implement",
    result: "SUCCESS",
    summary: "リバースプロキシのルーティング設定およびSSL終端処理の実装完了",
    next_context: "PR #8 のCI評価へ移行",
    started_at: pastIsoSec(75 * 60),
    ended_at: pastIsoSec(75 * 60 - 305), // 所要 305s (5m 5s)
  });
  insertMockRun(db, {
    repo: "k-wa-wa/bare-web-proxy",
    issue_number: 7,
    job_type: "evaluate",
    result: "FAIL",
    summary: "Evaluation failed: process exited with code 2",
    started_at: pastIsoSec(65 * 60),
    ended_at: pastIsoSec(65 * 60 - 25), // 所要 25s
  });
  insertMockRun(db, {
    repo: "k-wa-wa/bare-web-proxy",
    issue_number: 7,
    job_type: "evaluate",
    result: "SUCCESS",
    summary: "PRレビュー完了: merge_ready。HAProxy 設定構文チェック通過、単体テスト全件パス。",
    next_context: "レビュー承認済み。マージ準備完了。",
    started_at: pastIsoSec(12 * 60),
    ended_at: pastIsoSec(12 * 60 - 123), // 所要 123s
  });

  // 3. [多段ステップ・ブロック本番再現] pechka#55 (6段階の実行履歴)
  insertItem(db, {
    repo: "k-wa-wa/pechka",
    issue_number: 55,
    title: "動画ストリーミングのトランスコードパイプライン構築",
    state: "ActionRequired",
    display_hint: "エラー対応待ち",
    pr_number: 55,
    state_since: pastIso(8),
  });
  insertMockRun(db, {
    repo: "k-wa-wa/pechka",
    issue_number: 55,
    job_type: "implement",
    result: "SUCCESS",
    summary: "初期実装完了: ffmpeg パイプラインラッパーモジュールの追加",
    next_context: "PR #55 のレビューへ",
    started_at: pastIsoSec(120 * 60),
    ended_at: pastIsoSec(120 * 60 - 102), // 102s
  });
  insertMockRun(db, {
    repo: "k-wa-wa/pechka",
    issue_number: 55,
    job_type: "evaluate",
    result: "SUCCESS",
    summary: "レビュー完了。仕様追加が必要なため refine へ移行指示",
    next_context: "追加要件の精緻化ジョブをキュー投入",
    started_at: pastIsoSec(110 * 60),
    ended_at: pastIsoSec(110 * 60 - 37), // 37s
  });
  insertMockRun(db, {
    repo: "k-wa-wa/pechka",
    issue_number: 55,
    job_type: "refine",
    result: "SUCCESS",
    summary: "精緻化完了。可変ビットレート設定とチャンク配信仕様を Issue に追記",
    next_context: "精緻化された仕様に基づき再実装",
    started_at: pastIsoSec(100 * 60),
    ended_at: pastIsoSec(100 * 60 - 257), // 257s (4m 17s)
  });
  insertMockRun(db, {
    repo: "k-wa-wa/pechka",
    issue_number: 55,
    job_type: "implement",
    result: "FAIL",
    summary: "ビルドエラー: TS2322 型の不整合。BitrateOptions のプロパティ欠落",
    started_at: pastIsoSec(90 * 60),
    ended_at: pastIsoSec(90 * 60 - 123), // 123s
  });
  insertMockRun(db, {
    repo: "k-wa-wa/pechka",
    issue_number: 55,
    job_type: "implement",
    result: "FAIL",
    summary: "テスト失敗: timeout。トランスコード処理のモックが完了しませんでした",
    started_at: pastIsoSec(80 * 60),
    ended_at: pastIsoSec(80 * 60 - 331), // 331s (5m 31s)
  });
  insertMockRun(db, {
    repo: "k-wa-wa/pechka",
    issue_number: 55,
    job_type: "implement",
    result: "BLOCKED",
    summary: "3回連続失敗のためブロック。人間の介入が必要です。",
    next_context: "開発者による手動確認待ち",
    started_at: pastIsoSec(70 * 60),
    ended_at: pastIsoSec(70 * 60 - 108), // 108s
  });

  // 4. [単一エラー] pechka#61
  insertItem(db, {
    repo: "k-wa-wa/pechka",
    issue_number: 61,
    title: "【Frontend】管理画面に動画アップロード UI を追加する",
    state: "ActionRequired",
    display_hint: "エラー対応待ち",
    state_since: pastIso(5),
  });
  insertMockRun(db, {
    repo: "k-wa-wa/pechka",
    issue_number: 61,
    job_type: "implement",
    result: "FAIL",
    summary:
      "Claude Code 実行失敗 (exit code 1):\nerror TS2322: Type 'string' is not assignable to type 'File | Blob'.\n  --> frontend/components/AdminUploadModal.tsx:42:15\nビルド検証 (bun run typecheck) に失敗したためロールバックしました。",
    started_at: pastIso(80),
    ended_at: pastIso(75),
  });

  // 5. [正常カード] 仕様確認待ち
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 104,
    title: "ユーザー認証のリフレッシュトークンローテーション対応",
    state: "ActionRequired",
    display_hint: "仕様確認待ち",
    state_since: pastIso(15),
  });

  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 97,
    title: "テナント分離コンテキストの認可ミドルウェア",
    state: "ActionRequired",
    display_hint: "仕様確認待ち",
    parent_repo: "k-wa-wa/nuage-autopilot4",
    parent_issue_number: 95,
    state_since: pastIso(12),
  });

  // 6. [複数エラー履歴] リトライ上限超過
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 72,
    title: "CI ビルドパイプラインが 3 回連続失敗（リトライ上限超過）",
    state: "ActionRequired",
    display_hint: "CI 失敗（要判断）",
    pr_number: 75,
    state_since: pastIso(30),
  });
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 72,
    job_type: "implement",
    result: "FAIL",
    summary:
      "試行 1/3: 型エラー TS2339: Property 'userToken' does not exist on type 'SessionContext'.",
    started_at: pastIso(95),
    ended_at: pastIso(90),
  });
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 72,
    job_type: "implement",
    result: "FAIL",
    summary:
      "試行 2/3: 単体テスト失敗: tests/auth.test.ts > refreshToken > 401 Unauthorized expected 200",
    started_at: pastIso(88),
    ended_at: pastIso(85),
  });
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 72,
    job_type: "implement",
    result: "FAIL",
    summary:
      "試行 3/3 (直近): CI ビルドタイムアウト (1800秒超過)。修正コードが無限ループに陥っている可能性があります。",
    started_at: pastIso(80),
    ended_at: pastIso(76),
  });

  // 7. [正常カード] 助言待ち
  insertItem(db, {
    repo: "org/backend-service",
    issue_number: 42,
    title: "PostgreSQL 接続プールの最適化とタイムアウト監視",
    state: "ActionRequired",
    display_hint: "助言待ち",
    state_since: pastIso(280),
  });

  // 🤖 Working
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 110,
    title: "ダッシュボードのダークモードおよび高コントラスト表示の改善",
    state: "Working",
    display_hint: "実装中",
    pr_number: 112,
    job_type: "implement",
    started_at: pastIso(6),
    state_since: pastIso(10),
  });
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 110,
    job_type: "refine",
    result: "SUCCESS",
    summary: "精緻化完了: ダークモードCSS変数定義とコントラスト比（WCAG AA）基準策定",
    next_context: "設計に基づきダッシュボード実装に着手",
    started_at: pastIsoSec(900),
    ended_at: pastIsoSec(900 - 140), // 140s
  });
  insertItem(db, {
    repo: "org/frontend-app",
    issue_number: 15,
    title: "設定画面のレイアウト刷新とアクセシビリティ向上",
    state: "Working",
    display_hint: "精緻化中",
    job_type: "refine",
    started_at: pastIso(2),
    state_since: pastIso(3),
  });
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 95,
    title: "マルチテナント対応の基盤整備（DBスキーマ分離）",
    state: "Working",
    display_hint: "子タスク進行中 (2/5)",
    sub_issues_total: 5,
    sub_issues_completed: 2,
    state_since: pastIso(50),
  });

  // 📦 Queued
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 96,
    title: "テナント別スキーママイグレーション自動化",
    state: "Queued",
    display_hint: "着手待ち",
    job_type: "implement",
    parent_repo: "k-wa-wa/nuage-autopilot4",
    parent_issue_number: 95,
    state_since: pastIso(18),
  });
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 115,
    title: "Webhook 受信エンドポイントの署名検証強化",
    state: "Queued",
    display_hint: "着手待ち",
    job_type: "implement",
    state_since: pastIso(15),
  });
  insertItem(db, {
    repo: "org/backend-service",
    issue_number: 50,
    title: "S3 アップロード用の署名付き URL 生成 API 実装",
    state: "Queued",
    display_hint: "着手待ち",
    job_type: "refine",
    state_since: pastIso(12),
  });

  // 📥 Backlog
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 120,
    title: "モバイル通知のプッシュ通知連携（APNs / FCM）",
    state: "ActionRequired",
    display_hint: "未着手",
    state_since: pastIso(1440), // 1日前
  });
  insertItem(db, {
    repo: "org/frontend-app",
    issue_number: 22,
    title: "監査ログの CSV / JSON エクスポート機能",
    state: "ActionRequired",
    display_hint: "未着手",
    state_since: pastIso(4320), // 3日前
  });
}

function seedAlertsScenario(db: DB): void {
  runtime.graphqlRemaining = 120;
  runtime.graphqlLimit = 5000;
  runtime.graphqlResetAt = futureIso(12);
  runtime.restRemaining = 250;
  runtime.restLimit = 5000;
  runtime.restResetAt = futureIso(15);
  runtime.lastPollAt = pastIso(12); // 12分前（ポーリング停止警告発火）
  runtime.degraded.add("レートリミット待機中");
  runtime.degraded.add("監視対象外: org/private-secure-repo");

  // ジョブ失敗履歴を投入して「ジョブ滞留」バナーを発火
  db.query(`
    INSERT INTO job_queue (repo, issue_number, job_type, job_context, trigger_key, status, created_at, completed_at)
    VALUES ('k-wa-wa/nuage-autopilot4', 104, 'implement', 'TypeError: Failed to fetch API key from environment', 'trig_fail1', 'failed', ?, ?),
           ('org/backend-service', 42, 'refine', 'TimeoutError: LLM refinement timed out after 900s', 'trig_fail2', 'failed', ?, ?)
  `).run(pastIso(20), pastIso(10), pastIso(15), pastIso(5));

  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 99,
    title: "プロンプト生成時の構文解析エラーのリカバリ処理",
    state: "ActionRequired",
    display_hint: "Triage 失敗（要判断）",
    state_since: pastIso(15),
  });
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 99,
    job_type: "refine",
    result: "FAIL",
    summary:
      "Triage Agent 出力検証エラー:\nJSONパース失敗: Unexpected token < in JSON at position 0\nプロンプト指示に対するエージェントの出力がJSON形式ではありませんでした。",
    started_at: pastIso(18),
    ended_at: pastIso(15),
  });

  insertItem(db, {
    repo: "org/backend-service",
    issue_number: 42,
    title: "CI テストランナーのタイムアウト（30分超過）",
    state: "ActionRequired",
    display_hint: "CI 停滞",
    pr_number: 45,
    state_since: pastIso(35),
  });
  insertItem(db, {
    repo: "org/backend-service",
    issue_number: 38,
    title: "外部 API 接続不可による致命的エラー",
    state: "ActionRequired",
    display_hint: "エラー対応待ち",
    state_since: pastIso(50),
  });
  insertMockRun(db, {
    repo: "org/backend-service",
    issue_number: 38,
    job_type: "implement",
    result: "FAIL",
    summary:
      "外部 API (Stripe Webhook Gateway) 接続タイムアウト (ETIMEDOUT 192.0.2.1:443)\n3回のリトライ後も応答がないためジョブを中断しました。",
    started_at: pastIso(55),
    ended_at: pastIso(50),
  });

  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 101,
    title: "緊急パッチ適用処理",
    state: "Working",
    display_hint: "CI 待ち",
    pr_number: 102,
    job_type: "evaluate",
    started_at: pastIso(1),
    state_since: pastIso(2),
  });
}

function seedEmptyScenario(_db: DB): void {
  runtime.graphqlRemaining = 5000;
  runtime.graphqlLimit = 5000;
  runtime.graphqlResetAt = futureIso(55);
  runtime.restRemaining = 5000;
  runtime.restLimit = 5000;
  runtime.restResetAt = futureIso(58);
  runtime.lastPollAt = pastIso(0);
}

function seedDenseScenario(db: DB): void {
  runtime.graphqlRemaining = 3200;
  runtime.graphqlLimit = 5000;
  runtime.graphqlResetAt = futureIso(25);
  runtime.restRemaining = 4100;
  runtime.restLimit = 5000;
  runtime.restResetAt = futureIso(28);
  runtime.lastPollAt = pastIso(1);

  const repos = [
    "k-wa-wa/nuage-autopilot4",
    "very-long-organization-name-for-testing/extremely-long-repository-name-service-worker-component",
    "org/short",
    "company-corp/core-api-v2-gateway",
  ];

  const arHints: DisplayHint[] = [
    "仕様確認待ち",
    "マージ待ち",
    "助言待ち",
    "エラー対応待ち",
    "CI 失敗（要判断）",
    "完了確認待ち",
    "親 Issue の承認待ち",
    "中止済み",
    "Issue クローズ確認待ち",
  ];

  for (let i = 0; i < arHints.length; i++) {
    const hint = arHints[i]!;
    insertItem(db, {
      repo: repos[i % repos.length]!,
      issue_number: 200 + i,
      title: `[タスク-${i + 1}] ${hint} のテスト用アイテム。非常に長いタイトルの折り返しとレイアウトの整合性を確認するためのダミーテキストです。ABCDEFG 1234567890`,
      state: "ActionRequired",
      display_hint: hint,
      pr_number: i % 2 === 0 ? 500 + i : 0,
      state_since: pastIso(i * 180 + 5),
    });
  }

  for (let i = 0; i < 4; i++) {
    insertItem(db, {
      repo: repos[i % repos.length]!,
      issue_number: 300 + i,
      title: `Workingアイテム ${i + 1}: 自走エージェントによる自動処理中（プロンプト生成とコード編集）`,
      state: "Working",
      display_hint:
        i === 0 ? "精緻化中" : i === 1 ? "実装中" : i === 2 ? "評価中" : "子タスク進行中 (3/8)",
      pr_number: 600 + i,
      job_type: i === 0 ? "refine" : i === 1 ? "implement" : "evaluate",
      started_at: pastIso(i * 4 + 1),
      state_since: pastIso(i * 5 + 2),
    });
  }

  for (let i = 0; i < 6; i++) {
    insertItem(db, {
      repo: repos[i % repos.length]!,
      issue_number: 400 + i,
      title: `Queuedアイテム ${i + 1}: 実行待ち行列に入っているタスク`,
      state: "Queued",
      display_hint: "着手待ち",
      job_type: "implement",
      state_since: pastIso(10 + i * 2),
    });
  }

  for (let i = 0; i < 8; i++) {
    insertItem(db, {
      repo: repos[i % repos.length]!,
      issue_number: 500 + i,
      title: `Backlog未着手アイテム ${i + 1}: 将来対応予定の機能バックログ`,
      state: "ActionRequired",
      display_hint: "未着手",
      state_since: pastIso((i + 1) * 1440),
    });
  }
}

function seedErrorsScenario(db: DB): void {
  runtime.graphqlRemaining = 2400;
  runtime.graphqlLimit = 5000;
  runtime.graphqlResetAt = futureIso(19);
  runtime.restRemaining = 3100;
  runtime.restLimit = 5000;
  runtime.restResetAt = futureIso(22);
  runtime.lastPollAt = pastIso(1);

  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 71,
    title: "Triage エージェントの JSON パース例外が発生",
    state: "ActionRequired",
    display_hint: "Triage 失敗（要判断）",
    state_since: pastIso(8),
  });
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 71,
    job_type: "refine",
    result: "FAIL",
    summary:
      "Triage エージェント出力例外: JSON.parse エラー (position 124)\nモデルがマークダウンブロックなしで不完全なJSON文字列を出力しました。",
    started_at: pastIso(10),
    ended_at: pastIso(8),
  });

  // 複数エラー履歴を持つアイテム（リトライ3回すべて失敗したケース）
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 72,
    title: "CI ビルドパイプラインが 3 回連続失敗（リトライ上限超過）",
    state: "ActionRequired",
    display_hint: "CI 失敗（要判断）",
    pr_number: 75,
    state_since: pastIso(45),
  });
  // 1回目の失敗履歴 (40分前)
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 72,
    job_type: "implement",
    result: "FAIL",
    summary:
      "試行 1/3: 型エラー TS2339: Property 'userToken' does not exist on type 'SessionContext'.",
    started_at: pastIso(45),
    ended_at: pastIso(40),
  });
  // 2回目の失敗履歴 (25分前)
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 72,
    job_type: "implement",
    result: "FAIL",
    summary:
      "試行 2/3: 単体テスト失敗: tests/auth.test.ts > refreshToken > 401 Unauthorized expected 200",
    started_at: pastIso(30),
    ended_at: pastIso(25),
  });
  // 3回目の失敗履歴 (直近最新: 10分前)
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 72,
    job_type: "implement",
    result: "FAIL",
    summary:
      "試行 3/3 (最終): CI ビルドタイムアウト (1800秒超過)。修正コードが無限ループに陥っている可能性があります。",
    started_at: pastIso(15),
    ended_at: pastIso(10),
  });

  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 73,
    title: "LLM のコンテキスト上限超過によりワーカーが助言を求めて停止",
    state: "ActionRequired",
    display_hint: "助言待ち",
    state_since: pastIso(90),
  });
  insertMockRun(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 73,
    job_type: "implement",
    result: "BLOCKED",
    summary:
      "ワーカーが助言を要求: リファクタリング対象ファイルが想定より多く、影響範囲の決定について人間の指示を求めています。",
    started_at: pastIso(95),
    ended_at: pastIso(90),
  });

  insertItem(db, {
    repo: "org/backend-service",
    issue_number: 74,
    title: "ブランチコンフリクトによりマージ不可",
    state: "ActionRequired",
    display_hint: "エラー対応待ち",
    pr_number: 80,
    state_since: pastIso(120),
  });
  insertMockRun(db, {
    repo: "org/backend-service",
    issue_number: 74,
    job_type: "implement",
    result: "FAIL",
    summary:
      "Git マージ競合エラー (Merge conflict in src/routes/api.ts):\n自動マージを試行しましたがコンフリクトマーカーが残存したため中断しました。",
    started_at: pastIso(125),
    ended_at: pastIso(120),
  });

  insertItem(db, {
    repo: "org/backend-service",
    issue_number: 75,
    title: "手動でキャンセルされた長大ジョブ",
    state: "ActionRequired",
    display_hint: "中止済み",
    state_since: pastIso(200),
  });

  // 正常カード（エラーカードとの対比確認用）
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 80,
    title: "正常な機能要望: API レートリミットヘッダーの自動パース処理",
    state: "ActionRequired",
    display_hint: "仕様確認待ち",
    state_since: pastIso(15),
  });
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 81,
    title: "正常なPR: ダッシュボードのフォントファミリー設定改善",
    state: "ActionRequired",
    display_hint: "マージ待ち",
    pr_number: 82,
    state_since: pastIso(60),
  });

  // 🤖 Working レーン
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 90,
    title: "自動修復パイプラインのワーカープロセス隔離",
    state: "Working",
    display_hint: "実装中",
    pr_number: 91,
    job_type: "implement",
    started_at: pastIso(5),
    state_since: pastIso(8),
  });
  insertItem(db, {
    repo: "org/frontend-app",
    issue_number: 30,
    title: "エラートラッキング画面のフィルタリング機能追加",
    state: "Working",
    display_hint: "精緻化中",
    job_type: "refine",
    started_at: pastIso(2),
    state_since: pastIso(3),
  });

  // 📦 Queued レーン
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 92,
    title: "Webhook 再送キューのインデックス最適化",
    state: "Queued",
    display_hint: "着手待ち",
    job_type: "implement",
    state_since: pastIso(10),
  });

  // 📥 Backlog レーン
  insertItem(db, {
    repo: "org/backend-service",
    issue_number: 95,
    title: "将来のマイクロサービス分割に向けたドメインモデリング",
    state: "ActionRequired",
    display_hint: "未着手",
    state_since: pastIso(1440),
  });
}
