import type { CardContext, ChatMode, EventCallback } from "./types.ts";

/**
 * モック環境用のストリーミングシミュレーター
 */
const MOCK_STREAM_CHARS_PER_TICK = 3;
const MOCK_STREAM_TICK_MS = 15;

// 実ストリームより少し速い程度（約 200 文字/秒）で数文字ずつ流す
export async function streamMockText(
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

export async function streamMockResponse(
  emit: EventCallback,
  card?: CardContext,
  userMessage?: string,
  conversationId?: string,
  engine: "agy" | "claude" = "claude",
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
  // ツール名・引数のキーは実際の claude/agy 実行時（Bash の command, Read の file_path 等）に
  // 合わせてあり、tool-call-badge の内容表示（実行中/完了ステータスは追跡しない）を確認できる。
  if (isBrainstorm) {
    await emit({
      event: "tool_start",
      data: { id: "tool-1", name: "Read", args: { file_path: "docs/architecture.md" } },
    });
    await delay(350);
    await emit({
      event: "tool_end",
      data: {
        id: "tool-1",
        name: "Read",
        result: "1: # 実装アーキテクチャ\n2: 1. GitHub が真実源...",
      },
    });
  } else {
    await emit({
      event: "tool_start",
      data: {
        id: "tool-1",
        name: "Bash",
        args: {
          command: `gh pr view ${issueKey} --json state,mergeable`,
          description: "PR状態の確認",
        },
      },
    });
    await delay(400);

    await emit({
      event: "tool_end",
      data: {
        id: "tool-1",
        name: "Bash",
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
      name: "Read",
      args: { file_path: `${card?.repo || "repo"}/src/collect/poller.ts` },
    },
  });
  await delay(350);

  await emit({
    event: "tool_end",
    data: {
      id: "tool-2",
      name: "Read",
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
        name: "Bash",
        args: { command: `gh issue create -R ${targetRepo} --title "..." --body-file issue.md` },
      },
    });
    await delay(500);
    await emit({
      event: "tool_end",
      data: {
        id: "tool-3",
        name: "Bash",
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
          "**原因の切り分け**:\n\n",
          "| 観点 | 状況 | 対応 |\n",
          "|---|---|---|\n",
          "| リトライ回数 | 上限（3回）に到達 | 人間の判断が必要 |\n",
          "| CI ログ | GitHub Actions で確認可能 | ログを確認し原因を特定 |\n",
          "| 影響範囲 | 単一 PR のみ | 他タスクへの影響なし |\n\n",
          "**推奨アクション**:\n",
          "1. GitHub Issue 上で `@autopilot-bot retry` とコメントして再試行を促す\n",
          "2. または、対象 PR の CI ログ（GitHub Actions）でテスト失敗箇所の詳細を確認する\n",
          "3. または、対象 PR の CI ログ（GitHub Actions）でテスト失敗箇所の詳細を確認する\n",
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
