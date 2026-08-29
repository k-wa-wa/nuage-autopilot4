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
  // テーブル初期化
  db.run("DELETE FROM items");
  db.run("DELETE FROM job_queue");
  db.run("DELETE FROM runs");

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
        { label: "Claude/GPT (5h)", remainingPct: 100, resetAt: futureIso(299) },
        { label: "Claude/GPT (Weekly)", remainingPct: 100, resetAt: futureIso(8599) },
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
      ci_since, parent_repo, parent_issue_number, version, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, '', 0, ?, '', '', NULL, '', 0, 0, ?)
  `).run(
    it.repo,
    it.issue_number,
    it.title,
    it.state,
    it.display_hint,
    t,
    it.triaged ?? 1,
    it.pr_number ?? 0,
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

function seedStandardScenario(db: DB): void {
  runtime.graphqlRemaining = 4820;
  runtime.graphqlLimit = 5000;
  runtime.graphqlResetAt = futureIso(38);
  runtime.restRemaining = 4950;
  runtime.restLimit = 5000;
  runtime.restResetAt = futureIso(42);
  runtime.lastPollAt = pastIso(1);

  // 🧑 Action Required
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 104,
    title: "ユーザー認証のリフレッシュトークンローテーション対応",
    state: "ActionRequired",
    display_hint: "仕様確認待ち",
    state_since: pastIso(25),
  });
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 88,
    title: "GraphQL クエリエラー時の自動リトライおよび指数バックオフ",
    state: "ActionRequired",
    display_hint: "マージ待ち",
    pr_number: 92,
    state_since: pastIso(130), // ~2時間前
  });
  insertItem(db, {
    repo: "org/backend-service",
    issue_number: 42,
    title: "PostgreSQL 接続プールの最適化とタイムアウト監視",
    state: "ActionRequired",
    display_hint: "CI 失敗（要判断）",
    pr_number: 45,
    state_since: pastIso(280), // ~4時間前
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
    state_since: pastIso(50),
  });

  // 📦 Queued
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
    VALUES ('k-wa-wa/nuage-autopilot4', 104, 'implement', 'mock context', 'trig_fail1', 'failed', ?, ?),
           ('org/backend-service', 42, 'refine', 'mock context', 'trig_fail2', 'failed', ?, ?)
  `).run(pastIso(20), pastIso(10), pastIso(15), pastIso(5));

  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 99,
    title: "プロンプト生成時の構文解析エラーのリカバリ処理",
    state: "ActionRequired",
    display_hint: "Triage 失敗（要判断）",
    state_since: pastIso(15),
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
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 72,
    title: "CI ビルドパイプラインが 3 回連続失敗（リトライ上限超過）",
    state: "ActionRequired",
    display_hint: "CI 失敗（要判断）",
    pr_number: 75,
    state_since: pastIso(45),
  });
  insertItem(db, {
    repo: "k-wa-wa/nuage-autopilot4",
    issue_number: 73,
    title: "LLM のコンテキスト上限超過によりワーカーが助言を求めて停止",
    state: "ActionRequired",
    display_hint: "助言待ち",
    state_since: pastIso(90),
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
  insertItem(db, {
    repo: "org/backend-service",
    issue_number: 75,
    title: "手動でキャンセルされた長大ジョブ",
    state: "ActionRequired",
    display_hint: "中止済み",
    state_since: pastIso(200),
  });
}
