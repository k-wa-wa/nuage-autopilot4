import type { FC } from "hono/jsx";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  CloseIcon,
  HistoryIcon,
  PlusIcon,
  SparklesIcon,
} from "./icons.tsx";

export const ChatPane: FC = () => {
  return (
    <>
      <div
        id="pane-resizer"
        class="pane-resizer"
        title="ドラッグして幅を調整"
        style={{ display: "none" }}
      />
      <aside id="chat-pane" class="chat-pane" aria-hidden="true" style={{ display: "none" }}>
        <header class="chat-header">
          <div class="chat-header-title">
            <span class="chat-bot-icon">
              <SparklesIcon />
            </span>
            <span class="chat-title-text">Autopilot Chat</span>
          </div>
          <div class="chat-header-actions">
            <button
              type="button"
              id="chat-history-btn"
              class="chat-header-action-btn"
              aria-label="過去の会話履歴"
              title="過去の会話履歴"
            >
              <HistoryIcon size={14} />
              <span class="btn-label">履歴</span>
            </button>
            <button
              type="button"
              id="chat-new-btn"
              class="chat-header-action-btn"
              aria-label="新しい会話を開始"
              title="新しい会話を開始"
            >
              <PlusIcon size={14} />
              <span class="btn-label">新規会話</span>
            </button>
            <button
              type="button"
              id="chat-close-btn"
              class="chat-close-btn"
              aria-label="チャットパネルを閉じる"
              title="チャットパネルを閉じる (Esc)"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        {/* 過去の会話履歴ポップオーバー */}
        <div id="chat-history-popover" class="chat-history-popover" style={{ display: "none" }}>
          <div class="chat-history-header">
            <span>過去の会話履歴</span>
          </div>
          <div id="chat-history-list" class="chat-history-list" />
        </div>

        <div id="chat-messages" class="chat-messages">
          <div class="chat-welcome-msg">
            <div class="welcome-icon">
              <SparklesIcon />
            </div>
            <div id="quick-actions-investigate" class="chat-quick-actions">
              <button
                type="button"
                class="quick-chip"
                data-prompt="現在のパイプライン全体の健康状態と、滞留しているタスクを要約して"
              >
                📊 パイプライン全体のサマリー
              </button>
              <button
                type="button"
                class="quick-chip"
                data-prompt="直近で発生したエラーとリトライ失敗の状況を教えて"
              >
                ⚠️ 直近のエラー調査
              </button>
            </div>
            <div
              id="quick-actions-brainstorm"
              class="chat-quick-actions"
              style={{ display: "none" }}
            >
              <button
                type="button"
                class="quick-chip"
                data-prompt="新機能を追加したいので、既存設計に合わせた実装方針を相談したい"
              >
                💡 新機能の設計相談
              </button>
              <button
                type="button"
                class="quick-chip"
                data-prompt="現状のコードベースで改善・リファクタリングできる箇所を整理したい"
              >
                🛠️ リファクタリング方針の相談
              </button>
            </div>
          </div>
        </div>

        <footer class="chat-footer">
          <div class="agy-composer" id="agy-composer">
            {/* アタッチされたコンテキストチップ (Antigravity IDE Style) */}
            <div id="chat-context-chips" class="agy-context-chips" style={{ display: "none" }} />

            {/* テキスト入力エリア */}
            <textarea
              id="chat-input"
              class="agy-textarea"
              rows={2}
              placeholder="指示を入力、またはこのまま送信... (Shift+Enterで改行)"
            />

            {/* 下部ツールバー */}
            <div class="agy-toolbar">
              <div class="agy-toolbar-left">
                <div class="agy-mode-picker" title="動作モードを選択">
                  <select id="chat-mode-select" class="chat-mode-select">
                    <option value="investigate">🔍 調査</option>
                    <option value="brainstorm">💡 壁打ち</option>
                  </select>
                  <span class="agy-picker-arrow">
                    <ChevronDownIcon size={10} />
                  </span>
                </div>
                <div class="agy-engine-picker" title="使用するAIエンジンを選択">
                  <select id="chat-engine-select" class="agy-engine-select">
                    <option value="agy">Antigravity (Gemini)</option>
                    <option value="claude">Claude Code (Sonnet)</option>
                  </select>
                  <span class="agy-picker-arrow">
                    <ChevronDownIcon size={10} />
                  </span>
                </div>
              </div>
              <div class="agy-toolbar-right">
                <button type="button" id="chat-send-btn" class="agy-send-btn" title="送信 (Enter)">
                  <ArrowRightIcon size={14} />
                </button>
              </div>
            </div>
          </div>
        </footer>
      </aside>
    </>
  );
};
