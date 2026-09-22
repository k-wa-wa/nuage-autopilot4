import type { FC } from "hono/jsx";
import { ArrowRightIcon, ChevronDownIcon, CloseIcon, SparklesIcon } from "./icons.tsx";

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
              id="chat-close-btn"
              class="chat-close-btn"
              aria-label="チャットパネルを閉じる"
              title="チャットパネルを閉じる (Esc)"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div id="chat-messages" class="chat-messages">
          <div class="chat-welcome-msg">
            <div class="welcome-icon">
              <SparklesIcon />
            </div>
            <div class="chat-quick-actions">
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
