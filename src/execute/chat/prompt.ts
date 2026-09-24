import {
  type AutopilotEnvironment,
  type BuildInvestigatePromptOptions,
  type CardContext,
  getAutopilotEnvironment,
} from "./types.ts";

/** 並列の会話が同じチェックアウトを共有するため、エージェント自身に HEAD を確かめさせる。 */
export function pushWorkspaceGuidance(parts: string[]): void {
  parts.push("\n【作業ディレクトリ】");
  parts.push(
    "カレントディレクトリは Chat 専用のチェックアウトで、新しい会話の開始時に既定ブランチの最新へ更新されます。他の会話と共有しているため、会話の途中で更新されている可能性があります。",
  );
  parts.push(
    "コードを読んだりコマンドを実行したりする前に、毎回 `git log -1 --format='%h %ad %s' --date=iso` と `git status -sb` で HEAD の位置を確認し、回答にはどのコミット時点のコードを前提にしたかを明記してください。",
  );
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

  pushWorkspaceGuidance(parts);

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
    parts.push(`  - 仕様定義: ${currentEnv.sourceDir}/docs/specs/spec.md`);
    parts.push(`  - 設計方針: ${currentEnv.sourceDir}/docs/architecture.md`);
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

  pushWorkspaceGuidance(parts);

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
