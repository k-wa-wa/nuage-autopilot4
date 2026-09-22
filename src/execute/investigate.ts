import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { getVersionInfo } from "../cli/version.ts";
import type { Config } from "../config.ts";
import { chatWorkspaceDir, workspaceDir } from "../config.ts";
import { ensureChatWorkspace } from "./workspace.ts";

export interface CardContext {
  repo: string;
  issue_number: number;
  title: string;
  display_hint: string;
  state_lane?: string;
  url?: string;
  error_detail?: { summary: string; detail: string };
  error_history?: Array<{
    at: string;
    summary: string;
    detail: string;
    job_type?: string;
  }>;
  job_history?: Array<{
    job_type: string;
    started_at: string;
    finished_at?: string;
    status: string;
    error_summary?: string;
  }>;
}

export type ChatMode = "investigate" | "brainstorm";

export interface InvestigatePayload {
  message?: string;
  card?: CardContext;
  conversation_id?: string;
  engine?: "agy" | "claude";
  mode?: ChatMode;
}

export interface AutopilotEnvironment {
  version: string;
  commit: string;
  sourceDir: string;
}

export function getAutopilotEnvironment(): AutopilotEnvironment {
  const info = getVersionInfo();

  // 1. 環境変数 AUTOPILOT_SOURCE_DIR（Nix パッケージ等で明示的に配置されている場合）
  if (process.env.AUTOPILOT_SOURCE_DIR && existsSync(process.env.AUTOPILOT_SOURCE_DIR)) {
    return {
      version: info.version,
      commit: info.commit,
      sourceDir: process.env.AUTOPILOT_SOURCE_DIR,
    };
  }

  // 2. ローカル開発時（bun run / dev 等での実行時）
  // bun build --compile された単一バイナリでは import.meta.dir は /$bunfs/root となり存在しないため、
  // 実際に存在する実体ディレクトリか検証する
  try {
    const localDir = resolve(import.meta.dir, "../..");
    if (existsSync(join(localDir, "src")) && existsSync(join(localDir, "package.json"))) {
      return {
        version: info.version,
        commit: info.commit,
        sourceDir: localDir,
      };
    }
  } catch {
    // ignore
  }

  // 3. Chat 専用ワークスペース配下のクローン ($AUTOPILOT_HOME/chat-workspaces/<repo>)
  const home = process.env.AUTOPILOT_HOME || join(homedir(), ".autopilot");
  const chatWsDir = join(home, "chat-workspaces", "k-wa-wa", "nuage-autopilot4");
  if (existsSync(join(chatWsDir, "src"))) {
    return {
      version: info.version,
      commit: info.commit,
      sourceDir: chatWsDir,
    };
  }

  // 4. メインワークスペース配下のフォールバック
  const wsDir = join(home, "workspaces", "k-wa-wa", "nuage-autopilot4");
  if (existsSync(join(wsDir, "src"))) {
    return {
      version: info.version,
      commit: info.commit,
      sourceDir: wsDir,
    };
  }

  // 4. 実体ディレクトリが見つからない場合（単一バイナリ配布時で source 未同梱）
  return {
    version: info.version,
    commit: info.commit,
    sourceDir: "",
  };
}

export interface BuildInvestigatePromptOptions {
  card?: CardContext;
  userMessage?: string;
  env?: AutopilotEnvironment;
  mode?: ChatMode;
}

export interface InvestigateOptions {
  card?: CardContext;
  message?: string;
  conversationId?: string;
  engine?: "agy" | "claude";
  mode?: ChatMode;
  cfg?: Config;
  env?: AutopilotEnvironment;
}

export type InvestigateEvent =
  | {
      event: "init";
      data: {
        status?: string;
        mode?: string;
        engine?: string;
        conversation_id?: string;
        tools?: unknown;
      };
    }
  | { event: "thought"; data: { delta: string } }
  | { event: "tool_start"; data: { id?: string; name: string; args?: unknown } }
  | { event: "tool_end"; data: { id?: string; name: string; result?: unknown } }
  | { event: "text"; data: { delta: string } }
  | {
      event: "done";
      data: { status?: string; conversation_id?: string; usage?: unknown };
    }
  | { event: "error"; data: { message: string } };

export type EventCallback = (event: InvestigateEvent) => Promise<void> | void;

/**
 * リポジトリの作業ディレクトリ (cwd) を解決（spec.md §8 ワークスペース規約）。
 *
 * メインワーカーとの競合を防ぐため、Chat 専用ワークスペース（chat-workspaces/<repo>）を
 * 最優先として解決する。
 */
export function resolveWorkspaceDir(repo?: string, cfg?: Config): string | undefined {
  if (!repo) return undefined;

  // 1. Config が渡されている場合
  if (cfg) {
    const chatDir = chatWorkspaceDir(cfg, repo);
    if (existsSync(chatDir)) return chatDir;
    const dir = workspaceDir(cfg, repo);
    if (existsSync(dir)) return dir;
  }

  // 2. 環境変数 AUTOPILOT_HOME または既定の ~/.autopilot
  const home = process.env.AUTOPILOT_HOME || join(homedir(), ".autopilot");
  const chatFallback = join(home, "chat-workspaces", repo);
  if (existsSync(chatFallback)) return chatFallback;

  const fallbackDir = join(home, "workspaces", repo);
  if (existsSync(fallbackDir)) return fallbackDir;

  return undefined;
}

/**
 * 実機エージェント実行前に Chat 専用ワークスペースを準備する。
 */
export async function prepareInvestigateWorkspace(
  repo?: string,
  cfg?: Config,
  emit?: EventCallback,
): Promise<string | undefined> {
  const targetRepo = repo || "k-wa-wa/nuage-autopilot4";

  if (cfg) {
    try {
      if (emit) {
        await emit({
          event: "thought",
          data: { delta: `調査用ワークスペース (${targetRepo}) を準備中...\n` },
        });
      }
      return await ensureChatWorkspace(cfg, targetRepo);
    } catch (err) {
      if (emit) {
        await emit({
          event: "thought",
          data: { delta: `ワークスペース準備をスキップします: ${String(err)}\n` },
        });
      }
    }
  }

  return resolveWorkspaceDir(targetRepo, cfg);
}

/**
 * 壁打ち・設計相談プロンプトの構築
 */
export function buildBrainstormPrompt(
  cardOrOptions?: CardContext | BuildInvestigatePromptOptions,
  legacyUserMessage?: string,
): string {
  let card: CardContext | undefined;
  let userMessage: string | undefined;
  let env: AutopilotEnvironment | undefined;

  if (cardOrOptions && "repo" in cardOrOptions) {
    card = cardOrOptions;
    userMessage = legacyUserMessage;
  } else if (cardOrOptions) {
    card = cardOrOptions.card;
    userMessage = cardOrOptions.userMessage ?? legacyUserMessage;
    env = cardOrOptions.env;
  }

  const parts: string[] = [];

  parts.push("【役割・ペルソナ】");
  parts.push(
    "あなたは Autopilot の要件壁打ち・設計相談アーキテクトです。ユーザーと対話し、新機能のアイデアやリファクタリング方針、タスク分割などの設計を具体化します。",
  );
  parts.push(
    "対象リポジトリの既存コード構成や設計方針（ARCHITECTURE.md, docs/ 等）を前提知識として考慮し、複数の選択肢とトレードオフを客観的・論理的に提示してください。",
  );

  if (card) {
    parts.push("\n【関連コンテキスト (Issue/PR)】");
    parts.push(`- リポジトリ: ${card.repo}`);
    parts.push(`- 関連番号: #${card.issue_number}`);
    parts.push(`- タイトル: ${card.title}`);
  }

  const currentEnv = env ?? getAutopilotEnvironment();
  parts.push("\n【Autopilot 実行環境・断面】");
  parts.push(`- バージョン: autopilot ${currentEnv.version} (commit: ${currentEnv.commit})`);
  if (currentEnv.sourceDir) {
    parts.push(`- ソースコード配置パス: ${currentEnv.sourceDir}`);
  }

  parts.push("\n【GitHub Issue の起票】");
  parts.push(
    "仕様・方針がまとまった場合、またはユーザーから仕様化を頼まれた場合は、Issue の案（タイトル・背景と目的・仕様と変更内容・受け入れ条件のチェックリスト）を Markdown で提示し、起票してよいか確認してください。",
  );
  parts.push(
    `ユーザーが起票を明示的に指示したときだけ、シェルで \`gh issue create -R ${card?.repo || "<owner/repo>"} --title "<タイトル>" --body-file <本文を書いたファイル>\` を実行し、作成された Issue の URL を回答に含めてください。確認を得ずに起票してはいけません。`,
  );

  if (userMessage?.trim()) {
    parts.push(`\n【ユーザーの相談・メッセージ】\n${userMessage.trim()}`);
  } else {
    parts.push("\n新機能や改修について、どのようなアイデアや設計をお考えですか？");
  }

  return parts.join("\n");
}

/**
 * 調査プロンプトの構築（agy / claude 共通）
 */
export function buildInvestigatePrompt(
  cardOrOptions?: CardContext | BuildInvestigatePromptOptions,
  legacyUserMessage?: string,
): string {
  const mode = (cardOrOptions && !("repo" in cardOrOptions) && cardOrOptions.mode) || "investigate";
  if (mode === "brainstorm") {
    return buildBrainstormPrompt(cardOrOptions, legacyUserMessage);
  }

  let card: CardContext | undefined;
  let userMessage: string | undefined;
  let env: AutopilotEnvironment | undefined;

  if (cardOrOptions && "repo" in cardOrOptions) {
    card = cardOrOptions;
    userMessage = legacyUserMessage;
  } else if (cardOrOptions) {
    card = cardOrOptions.card;
    userMessage = cardOrOptions.userMessage ?? legacyUserMessage;
    env = cardOrOptions.env;
  }

  const parts: string[] = [];

  if (card) {
    parts.push("【調査対象アイテム】");
    parts.push(`- リポジトリ: ${card.repo}`);
    parts.push(`- Issue/PR 番号: #${card.issue_number}`);
    parts.push(`- タイトル: ${card.title}`);
    parts.push(`- 現在のレーン: ${card.state_lane || "不明"}`);
    parts.push(`- 表示ヒント: ${card.display_hint}`);
    if (card.error_detail) {
      parts.push(`- 直近エラー概要: ${card.error_detail.summary}`);
      parts.push(`- 直近エラー詳細: ${card.error_detail.detail}`);
    }
  }

  const currentEnv = env ?? getAutopilotEnvironment();
  parts.push("\n【Autopilot 実行環境・断面】");
  parts.push(`- バージョン: autopilot ${currentEnv.version} (commit: ${currentEnv.commit})`);
  if (currentEnv.sourceDir) {
    parts.push(`- ソースコード配置パス: ${currentEnv.sourceDir}`);
    parts.push("- 主な仕様・実装ファイル:");
    parts.push(`  - 仕様定義: ${currentEnv.sourceDir}/docs/spec.md`);
    parts.push(`  - 設計方針: ${currentEnv.sourceDir}/ARCHITECTURE.md`);
    parts.push(`  - 判定ロジック: ${currentEnv.sourceDir}/src/decide/`);
    parts.push(`  - 実行エンジン: ${currentEnv.sourceDir}/src/execute/`);
    parts.push(`  - 収集ポーラー: ${currentEnv.sourceDir}/src/collect/`);
    parts.push(`  - 状態・キュー管理: ${currentEnv.sourceDir}/src/store/`);
  } else {
    parts.push(
      `- GitHub リポジトリ: https://github.com/k-wa-wa/nuage-autopilot4 (commit: ${currentEnv.commit})`,
    );
    parts.push(
      "- （注意: スタンドアロンバイナリ実行のためローカルにソースツリーは配置されていません）",
    );
  }

  parts.push("\n【調査のガイドライン】");
  parts.push(
    "アイテムの滞留やエラー原因は、対象リポジトリ固有の不備（コード・CI設定など）だけでなく、",
  );
  parts.push(
    "Autopilot 自身の判定（Triage 判定、リトライ上限到達、FastPass 条件、直列化制御など）に起因する場合があります。",
  );
  parts.push(
    "必要に応じて上記 Autopilot のソースコードや仕様書も参照し、両面から根本原因と推奨アクションを報告してください。",
  );

  if (userMessage?.trim()) {
    parts.push(`\n【指示・質問】\n${userMessage.trim()}`);
  } else {
    parts.push("\n上記アイテムの現在の状況とエラー原因を調査し、分かりやすく報告してください。");
  }

  return parts.join("\n");
}

/**
 * ローカル CLI 実行ファイルの存在確認
 */
export function isCliAvailable(cliName: "agy" | "claude"): boolean {
  try {
    const res = Bun.spawnSync(["which", cliName], {
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
    });
    return res.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * 改行区切り JSON ストリームのパース共通ヘルパー
 */
async function processJsonStream(
  readable: ReadableStream<Uint8Array>,
  onLine: (parsed: Record<string, unknown>) => Promise<void> | void,
): Promise<void> {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        await onLine(parsed);
      } catch {
        // 不正な JSON 行はスキップ
      }
    }
  }
}

/**
 * モック環境用のストリーミングシミュレーター
 */
const MOCK_STREAM_CHARS_PER_TICK = 3;
const MOCK_STREAM_TICK_MS = 15;

// 実ストリームより少し速い程度（約 200 文字/秒）で数文字ずつ流す
async function streamMockText(
  emit: EventCallback,
  text: string,
  delay: (ms: number) => Promise<void>,
): Promise<void> {
  const chars = [...text];
  for (let i = 0; i < chars.length; i += MOCK_STREAM_CHARS_PER_TICK) {
    await emit({
      event: "text",
      data: { delta: chars.slice(i, i + MOCK_STREAM_CHARS_PER_TICK).join("") },
    });
    await delay(MOCK_STREAM_TICK_MS);
  }
}

async function streamMockResponse(
  emit: EventCallback,
  card?: CardContext,
  userMessage?: string,
  conversationId?: string,
  engine: "agy" | "claude" = "agy",
  mode: ChatMode = "investigate",
): Promise<void> {
  // MOCK_CHAT は dev サーバーでも立つので、待ち時間を省くのはテスト実行時だけにする
  const isTest = Boolean(process.env.BUN_TEST || process.env.NODE_ENV === "test");
  const delay = (ms: number) => (isTest ? Bun.sleep(1) : Bun.sleep(ms));
  const convId = conversationId || `mock-${Date.now()}`;
  const isContinuation = Boolean(conversationId);

  const issueKey = card ? `${card.repo}#${card.issue_number}` : "対象アイテム";
  const hasError = Boolean(
    card?.error_detail || (card?.error_history && card.error_history.length > 0),
  );

  const isBrainstorm = mode === "brainstorm";
  const targetRepo = card?.repo || "k-wa-wa/nuage-autopilot4";

  // 1. 初期化イベント
  await emit({
    event: "init",
    data: { status: "connected", mode: "mock", engine, conversation_id: convId },
  });
  await delay(150);

  // 2. 思考プロセス (Thinking)
  if (isBrainstorm) {
    await emit({
      event: "thought",
      data: {
        delta: `リポジトリ構成 (${targetRepo}) と既存設計 (ARCHITECTURE.md 等) を確認中...\n`,
      },
    });
  } else if (isContinuation) {
    await emit({
      event: "thought",
      data: {
        delta: `前回の会話セッション（${convId.slice(0, 16)}...）を引き継ぎ、追加の質問「${userMessage || ""}」を解析中。\n`,
      },
    });
  } else {
    await emit({
      event: "thought",
      data: { delta: `カード情報（${issueKey}）と直近のログを精査しています...\n` },
    });
  }
  await delay(300);

  // 3. ツール呼び出し 1
  if (isBrainstorm) {
    await emit({
      event: "tool_start",
      data: { id: "tool-1", name: "view_file", args: { path: "ARCHITECTURE.md", lines: "1-40" } },
    });
    await delay(350);
    await emit({
      event: "tool_end",
      data: {
        id: "tool-1",
        name: "view_file",
        result: "1: # 実装アーキテクチャ\n2: 1. GitHub が真実源...",
      },
    });
  } else {
    await emit({
      event: "tool_start",
      data: { id: "tool-1", name: "git_log", args: { target: issueKey, limit: 3 } },
    });
    await delay(400);

    await emit({
      event: "tool_end",
      data: {
        id: "tool-1",
        name: "git_log",
        result: "commit e39a1b (HEAD) - fix: retry limit handling",
      },
    });
  }
  await delay(250);

  // 4. 思考プロセス 段階 2
  await emit({
    event: "thought",
    data: { delta: "ソースコードの判定ロジックとエラー詳細を照合中...\n" },
  });
  await delay(250);

  // 5. ツール呼び出し 2
  await emit({
    event: "tool_start",
    data: {
      id: "tool-2",
      name: "view_file",
      args: { path: `${card?.repo || "repo"}/src/collect/poller.ts`, lines: "40-65" },
    },
  });
  await delay(350);

  await emit({
    event: "tool_end",
    data: {
      id: "tool-2",
      name: "view_file",
      result: "40: export const DEFAULTS = { pollIntervalMs: 60_000, ciGraceMs: 600_000 ... };",
    },
  });
  await delay(300);

  // 6. 思考プロセス 段階 3
  await emit({
    event: "thought",
    data: { delta: "原因の特定が完了。ユーザー向けの解説と推奨アクションを生成します。\n" },
  });
  await delay(200);

  // 7. 回答本文のトークンストリーミング
  const wantsCreate = isBrainstorm && /起票/.test(userMessage ?? "");
  if (wantsCreate) {
    const mockIssueNumber = Math.floor(Math.random() * 900) + 100;
    await emit({
      event: "tool_start",
      data: {
        id: "tool-3",
        name: "run_shell_command",
        args: { command: `gh issue create -R ${targetRepo} --title "..." --body-file issue.md` },
      },
    });
    await delay(500);
    await emit({
      event: "tool_end",
      data: {
        id: "tool-3",
        name: "run_shell_command",
        result: `https://github.com/${targetRepo}/issues/${mockIssueNumber}`,
      },
    });
    await delay(200);
    const text = `✅ Issue を起票しました: https://github.com/${targetRepo}/issues/${mockIssueNumber}\n\n次回のポーリングで Autopilot に取り込まれます。`;
    await streamMockText(emit, text, delay);
    await emit({ event: "done", data: { status: "SUCCESS", conversation_id: convId } });
    return;
  }

  const responseChunks = isBrainstorm
    ? [
        `### 💡 壁打ち提案: 設計方針と Issue 案\n\n`,
        `ご相談（「**${userMessage || "新機能の検討"}**」）について、\`${targetRepo}\` の設計方針を踏まえて仕様を整理しました。\n\n`,
        "**設計上の検討ポイント**:\n",
        "- **Autopilot 原則の遵守**: 独立したモジュールとして実装し、既存パイプラインの直列化・排他制御を壊さない構造にします。\n",
        "- **自律完走の保証**: 受け入れ条件（Acceptance Criteria）を明記し、Worker Agent がテストを自動生成して完走できるようにします。\n\n",
        "#### Issue 案\n",
        `**タイトル**: feat: ${userMessage ? userMessage.slice(0, 30) : "新機能の実装"}\n`,
        `**対象リポジトリ**: \`${targetRepo}\`\n\n`,
        "#### 背景・目的\n",
        `${userMessage ? userMessage : "新機能の追加により運用効率とユーザー体験を向上させる。"}\n\n`,
        "#### 仕様・変更内容\n",
        "- 対象モジュールの設計見直しとインターフェース拡張\n",
        "- 既存の SQLite ストアへの状態記録およびエラーハンドリングの追加\n",
        "- CI パイプラインでの自動検証ステップの追加\n\n",
        "#### 受け入れ条件 (Acceptance Criteria)\n",
        "- [ ] 主要ロジックの単体テストがパスすること\n",
        "- [ ] 既存機能にリグレッションが発生しないこと\n",
        "- [ ] `bun run check` をパスすること\n\n",
        "この内容で起票してよければ「**起票して**」と返信してください。",
      ]
    : hasError
      ? [
          `### 🔍 調査結果: ${issueKey}\n\n`,
          "**現象の要約**:\n",
          "直近の実行において、以下のエラーが記録されています:\n",
          `> **${card?.error_detail?.summary || "ジョブの実行時エラー"}**\n\n`,
          "**推定される原因**:\n",
          "- エージェント実行時のコミット生成、または依存リソースの競合によって処理が中断しています。\n",
          "- リトライ回数が上限に達したか、人間の判断が必要な状態（`ActionRequired`）に遷移しています。\n\n",
          "**推奨アクション**:\n",
          "1. GitHub Issue 上で `@autopilot-bot retry` とコメントして再試行を促す\n",
          "2. または、対象 PR の CI ログ（GitHub Actions）でテスト失敗箇所の詳細を確認する\n",
        ]
      : [
          `### ℹ️ 状況サマリー: ${issueKey}\n\n`,
          `**現在のステータス**: \`${card?.display_hint || "正常稼働中"}\`（レーン: **${card?.state_lane || "Working"}**）\n\n`,
          "**調査詳細**:\n",
          "- 異常終了したエラー履歴は見当たらず、パイプラインの正常な待機またはバックグラウンド処理の途中です。\n",
          "- ジョブキューおよびポーリング周期に従って次回イテレーションで評価されます。\n\n",
          userMessage
            ? `ご質問（「${userMessage}」）について: 追加の操作は不要です。必要に応じて GitHub 上でコメントすると優先度が上がります。\n`
            : "**次のアクション**: 処理の完了（PR 作成またはレビュー結果）をお待ちください。\n",
        ];

  await streamMockText(emit, responseChunks.join(""), delay);

  // 8. 完了イベント
  await emit({
    event: "done",
    data: { status: "SUCCESS", conversation_id: convId },
  });
}

/**
 * 本番 agy CLI とのストリーミング連携
 */
async function streamAgyResponse(
  emit: EventCallback,
  card?: CardContext,
  userMessage?: string,
  conversationId?: string,
  cfg?: Config,
  env?: AutopilotEnvironment,
  mode: ChatMode = "investigate",
): Promise<void> {
  const cwd = await prepareInvestigateWorkspace(card?.repo, cfg, emit);
  const prompt = buildInvestigatePrompt({ card, userMessage, env, mode });

  const args = [
    "agy",
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--approval-mode",
    "auto-approve",
    "--model",
    "gemini-3.8-flash",
  ];

  if (conversationId && !conversationId.startsWith("mock-")) {
    args.push("--conversation", conversationId);
  }

  try {
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      cwd,
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
      },
    });

    await processJsonStream(proc.stdout, async (parsed) => {
      if (parsed.event === "init") {
        const initData = parsed.init as { tools?: unknown } | undefined;
        await emit({
          event: "init",
          data: {
            conversation_id: parsed.conversation_id as string | undefined,
            tools: initData?.tools,
            engine: "agy",
          },
        });
      } else if (parsed.event === "step_update") {
        const step = parsed.step_update as
          | {
              step_type?: string;
              text_delta?: string;
              thought?: string;
              tool_call?: { id?: string; name: string; args?: unknown };
            }
          | undefined;

        if (step?.step_type === "agent_response" && step.text_delta) {
          await emit({ event: "text", data: { delta: step.text_delta } });
        } else if (step?.thought) {
          await emit({ event: "thought", data: { delta: step.thought } });
        } else if (step?.tool_call) {
          await emit({ event: "tool_start", data: step.tool_call });
        }
      } else if (parsed.event === "result") {
        const res = parsed.result as
          | { status?: string; conversation_id?: string; usage?: unknown }
          | undefined;
        await emit({
          event: "done",
          data: {
            status: res?.status,
            conversation_id: res?.conversation_id,
            usage: res?.usage,
          },
        });
      }
    });

    await proc.exited;
  } catch (err) {
    await emit({ event: "error", data: { message: String(err) } });
  }
}

/**
 * 本番 claude CLI とのストリーミング連携
 */
async function streamClaudeResponse(
  emit: EventCallback,
  card?: CardContext,
  userMessage?: string,
  conversationId?: string,
  cfg?: Config,
  env?: AutopilotEnvironment,
  mode: ChatMode = "investigate",
): Promise<void> {
  const cwd = await prepareInvestigateWorkspace(card?.repo, cfg, emit);
  const prompt = buildInvestigatePrompt({ card, userMessage, env, mode });

  const args = [
    "claude",
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-mode",
    "bypassPermissions",
  ];

  if (conversationId && !conversationId.startsWith("mock-")) {
    args.push("--resume", conversationId);
  }

  try {
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      cwd,
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
      },
    });

    await processJsonStream(proc.stdout, async (parsed) => {
      if (parsed.session_id && parsed.type === "system" && parsed.status === "requesting") {
        await emit({
          event: "init",
          data: {
            conversation_id: parsed.session_id as string,
            engine: "claude",
          },
        });
      } else if (parsed.type === "stream_event") {
        const ev = parsed.event as
          | {
              type?: string;
              content_block?: { type?: string; id?: string; name?: string; input?: unknown };
              delta?: { type?: string; thinking?: string; text?: string };
            }
          | undefined;

        if (ev?.type === "content_block_start") {
          const cb = ev.content_block;
          if (cb?.type === "tool_use") {
            await emit({
              event: "tool_start",
              data: { id: cb.id, name: cb.name || "tool", args: cb.input },
            });
          }
        } else if (ev?.type === "content_block_delta") {
          const d = ev.delta;
          if (d?.type === "thinking_delta") {
            await emit({ event: "thought", data: { delta: d.thinking || d.text || "" } });
          } else if (d?.type === "text_delta") {
            await emit({ event: "text", data: { delta: d.text || "" } });
          }
        }
      } else if (parsed.type === "result") {
        await emit({
          event: "done",
          data: {
            status: "SUCCESS",
            conversation_id: parsed.session_id as string | undefined,
            usage: parsed.usage,
          },
        });
      }
    });

    await proc.exited;
  } catch (err) {
    await emit({ event: "error", data: { message: String(err) } });
  }
}

/**
 * 調査処理のエントリポイント（UI 非依存・ストリーミング）
 */
export async function streamInvestigate(
  options: InvestigateOptions,
  emit: EventCallback,
): Promise<void> {
  const selectedEngine = options.engine || "agy";
  const selectedMode = options.mode || "investigate";
  const isAvailable = isCliAvailable(selectedEngine);
  const useMock = !isAvailable || process.env.MOCK_CHAT === "true";

  if (useMock) {
    await streamMockResponse(
      emit,
      options.card,
      options.message,
      options.conversationId,
      selectedEngine,
      selectedMode,
    );
  } else if (selectedEngine === "claude") {
    await streamClaudeResponse(
      emit,
      options.card,
      options.message,
      options.conversationId,
      options.cfg,
      options.env,
      selectedMode,
    );
  } else {
    await streamAgyResponse(
      emit,
      options.card,
      options.message,
      options.conversationId,
      options.cfg,
      options.env,
      selectedMode,
    );
  }
}
