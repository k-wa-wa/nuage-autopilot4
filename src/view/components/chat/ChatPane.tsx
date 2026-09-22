import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { cardKeyOf, formatAgo } from "../../utils.ts";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  CloseIcon,
  HistoryIcon,
  MarkdownIcon,
  PlusIcon,
  SparklesIcon,
} from "../icons.tsx";
import { Markdown } from "./Markdown.tsx";
import type {
  ChatController,
  ChatEngine,
  ChatEntry,
  ChatMode,
  ConversationSummary,
} from "./useChat.ts";

const WIDTH_STORAGE_KEY = "autopilot_chat_pane_width";
const MIN_WIDTH = 280;

const QUICK_PROMPTS: Record<ChatMode, Array<{ label: string; prompt: string }>> = {
  investigate: [
    {
      label: "📊 パイプライン全体のサマリー",
      prompt: "現在のパイプライン全体の健康状態と、滞留しているタスクを要約して",
    },
    {
      label: "⚠️ 直近のエラー調査",
      prompt: "直近で発生したエラーとリトライ失敗の状況を教えて",
    },
  ],
  brainstorm: [
    {
      label: "💡 新機能の設計相談",
      prompt: "新機能を追加したいので、既存設計に合わせた実装方針を相談したい",
    },
    {
      label: "🛠️ リファクタリング方針の相談",
      prompt: "現状のコードベースで改善・リファクタリングできる箇所を整理したい",
    },
  ],
};

function placeholderFor(chat: ChatController): string {
  const brainstorm = chat.mode === "brainstorm";
  if (chat.card) {
    const key = cardKeyOf(chat.card);
    return brainstorm
      ? `${key} について新機能やリファクタリングの相談を入力...`
      : `${key} について指示を入力、またはこのまま送信...`;
  }
  return brainstorm
    ? "新機能のアイデアや設計の相談を入力... (Enterで送信, Shift+Enterで改行)"
    : "質問や指示を入力... (Enterで送信, Shift+Enterで改行)";
}

function EntryView({ entry }: { entry: ChatEntry }) {
  if (entry.role === "user") {
    return (
      <div class="chat-msg user">
        {entry.pin && <div class="msg-context-pin">📎 {entry.pin}</div>}
        <div class="msg-bubble">{entry.text}</div>
      </div>
    );
  }

  const { live } = entry;
  return (
    <div class="chat-msg assistant">
      {live?.thinking && (
        <details class="thinking-accordion" open>
          <summary>💭 Thinking ({live.thinkingDone ? "完了" : "思考中..."})</summary>
          <pre class="thinking-content">{live.thinking}</pre>
        </details>
      )}
      {live && live.tools.length > 0 && (
        <div class="tool-call-container">
          {live.tools.map((t) => (
            <div class="tool-call-badge" key={t.id}>
              <span class="tool-icon">🛠️</span> <code>{t.name}</code>
              {t.detail && <code class="tool-detail">{t.detail}</code>}
            </div>
          ))}
        </div>
      )}
      <div class="msg-bubble">
        {entry.text ? (
          <Markdown text={entry.text} />
        ) : (
          live?.streaming && <span class="meta">{live.pendingLabel}</span>
        )}
        {entry.error && <div class="chat-error">⚠️ {entry.error}</div>}
      </div>
    </div>
  );
}

function HistoryPopover(props: {
  items: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  popoverRef: { current: HTMLDivElement | null };
}) {
  return (
    <div class="chat-history-popover" ref={props.popoverRef}>
      <div class="chat-history-header">
        <span>過去の会話履歴</span>
      </div>
      <div class="chat-history-list">
        {props.items.length === 0 ? (
          <div class="chat-history-empty">過去の会話履歴はありません</div>
        ) : (
          props.items.map((c) => (
            <button
              type="button"
              key={c.id}
              class={c.id === props.activeId ? "chat-history-item active" : "chat-history-item"}
              onClick={() => props.onSelect(c.id)}
            >
              <div class="chat-history-item-title">{c.title || "Autopilot Chat"}</div>
              <div class="chat-history-meta">
                <span class="chat-history-badge">
                  {c.mode === "brainstorm" ? "💡 壁打ち" : "🔍 調査"}
                </span>
                <span class="chat-history-badge">{c.engine === "claude" ? "Claude" : "AGY"}</span>
                <span>{formatAgo(c.updated_at)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ContextChips({ chat }: { chat: ChatController }) {
  const c = chat.card;
  if (!c) return null;
  const summary = c.error_detail?.summary;
  return (
    <div class="agy-context-chips">
      <div class="agy-chip issue-chip" title="アタッチされたコンテキスト">
        <span class="chip-icon">
          <MarkdownIcon size={12} />
        </span>
        <span class="chip-text">{cardKeyOf(c)}</span>
        <button
          type="button"
          class="chip-close"
          title="コンテキストを解除"
          onClick={chat.clearCard}
        >
          ×
        </button>
      </div>
      {summary && (
        <div class="agy-chip error-chip" title="直近のエラー情報">
          <span class="chip-icon">⚠️</span>
          <span class="chip-text">
            Error: {summary.length > 28 ? `${summary.slice(0, 28)}…` : summary}
          </span>
        </div>
      )}
    </div>
  );
}

export function ChatPane({ chat }: { chat: ChatController }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<ConversationSummary[] | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const paneRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const historyBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const saved = Number.parseInt(localStorage.getItem(WIDTH_STORAGE_KEY) ?? "", 10);
    if (!Number.isNaN(saved) && saved >= MIN_WIDTH && saved <= window.innerWidth * 0.8) {
      setWidth(saved);
    }
  }, []);

  useEffect(() => {
    if (chat.open && !chat.streaming) textareaRef.current?.focus();
  }, [chat.open, chat.streaming]);

  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.entries]);

  const { open, close } = chat;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // モバイルのボトムシート表示中は背面ページの touch スクロール/バウンスを止める
  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 768px)").matches) return;
    const scrollY = window.scrollY;
    document.body.classList.add("chat-pane-locked");
    document.body.style.top = `-${scrollY}px`;
    return () => {
      document.body.classList.remove("chat-pane-locked");
      document.body.style.top = "";
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  const historyOpen = history !== null;
  useEffect(() => {
    if (!historyOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || historyBtnRef.current?.contains(target)) return;
      setHistory(null);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [historyOpen]);

  const toggleHistory = async () => {
    if (historyOpen) {
      setHistory(null);
      return;
    }
    try {
      setHistory(await chat.listConversations());
    } catch {
      // 取得に失敗したら開かない
    }
  };

  const selectConversation = async (id: string) => {
    await chat.restore(id);
    setHistory(null);
  };

  const startNewConversation = () => {
    chat.reset();
    setInput("");
    textareaRef.current?.focus();
  };

  const submit = () => {
    if (chat.streaming) return;
    const text = input;
    setInput("");
    void chat.send(text);
  };

  const pickQuickPrompt = (prompt: string) => {
    setInput(prompt);
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      // 反映前の value に対して setSelectionRange しないよう次フレームで末尾へ
      requestAnimationFrame(() => ta.setSelectionRange(prompt.length, prompt.length));
    }
  };

  const startResize = (e: MouseEvent) => {
    const startX = e.clientX;
    const startWidth = paneRef.current?.getBoundingClientRect().width ?? 460;
    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const maxW = Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.75));
      const next = Math.max(MIN_WIDTH, Math.min(maxW, startWidth + startX - ev.clientX));
      setWidth(next);
      localStorage.setItem(WIDTH_STORAGE_KEY, String(Math.round(next)));
    };
    const onUp = () => {
      setResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const hidden = chat.open ? undefined : "none";

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: マウス専用のリサイズハンドル */}
      <div
        class={resizing ? "pane-resizer resizing" : "pane-resizer"}
        title="ドラッグして幅を調整"
        style={{ display: hidden }}
        onMouseDown={startResize}
      />
      <div
        class={chat.open ? "chat-pane-backdrop chat-pane-backdrop-open" : "chat-pane-backdrop"}
        aria-hidden="true"
        onClick={chat.close}
      />
      <aside
        ref={paneRef}
        class={chat.open ? "chat-pane chat-pane-open" : "chat-pane"}
        aria-hidden={!chat.open}
        style={{ width: width ? `${width}px` : undefined }}
      >
        <div class="chat-drag-handle" aria-hidden="true" onClick={chat.close} />
        <header class="chat-header">
          <div class="chat-header-title">
            <span class="chat-bot-icon">
              <SparklesIcon />
            </span>
            <span class="chat-title-text">Autopilot Chat</span>
          </div>
          <div class="chat-header-actions">
            <button
              ref={historyBtnRef}
              type="button"
              class="chat-header-action-btn"
              aria-label="過去の会話履歴"
              title="過去の会話履歴"
              onClick={() => void toggleHistory()}
            >
              <HistoryIcon size={14} />
              <span class="btn-label">履歴</span>
            </button>
            <button
              type="button"
              class="chat-header-action-btn"
              aria-label="新しい会話を開始"
              title="新しい会話を開始"
              onClick={startNewConversation}
            >
              <PlusIcon size={14} />
              <span class="btn-label">新規会話</span>
            </button>
            <button
              type="button"
              class="chat-close-btn"
              aria-label="チャットパネルを閉じる"
              title="チャットパネルを閉じる (Esc)"
              onClick={chat.close}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        {history && (
          <HistoryPopover
            items={history}
            activeId={chat.conversationId}
            onSelect={(id) => void selectConversation(id)}
            popoverRef={popoverRef}
          />
        )}

        <div class="chat-messages" ref={messagesRef}>
          {chat.entries.length === 0 ? (
            <div class="chat-welcome-msg">
              <div class="welcome-icon">
                <SparklesIcon />
              </div>
              <div class="chat-quick-actions">
                {QUICK_PROMPTS[chat.mode].map((q) => (
                  <button
                    type="button"
                    key={q.prompt}
                    class="quick-chip"
                    onClick={() => pickQuickPrompt(q.prompt)}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chat.entries.map((e) => <EntryView key={e.id} entry={e} />)
          )}
        </div>

        <footer class="chat-footer">
          <div class="agy-composer">
            <ContextChips chat={chat} />
            <textarea
              ref={textareaRef}
              class="agy-textarea"
              rows={2}
              placeholder={placeholderFor(chat)}
              value={input}
              onInput={(e) => setInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div class="agy-toolbar">
              <div class="agy-toolbar-left">
                <div class="agy-mode-picker" title="動作モードを選択">
                  <select
                    class="chat-mode-select"
                    value={chat.mode}
                    onChange={(e) => chat.setMode(e.currentTarget.value as ChatMode)}
                  >
                    <option value="investigate">🔍 調査</option>
                    <option value="brainstorm">💡 壁打ち</option>
                  </select>
                  <span class="agy-picker-arrow">
                    <ChevronDownIcon size={10} />
                  </span>
                </div>
                <div class="agy-engine-picker" title="使用するAIエンジンを選択">
                  <select
                    class="agy-engine-select"
                    value={chat.engine}
                    onChange={(e) => chat.setEngine(e.currentTarget.value as ChatEngine)}
                  >
                    <option value="agy">Antigravity (Gemini)</option>
                    <option value="claude">Claude Code (Sonnet)</option>
                  </select>
                  <span class="agy-picker-arrow">
                    <ChevronDownIcon size={10} />
                  </span>
                </div>
              </div>
              <div class="agy-toolbar-right">
                <button
                  type="button"
                  class="agy-send-btn"
                  title="送信 (Enter)"
                  disabled={chat.streaming}
                  onClick={submit}
                >
                  <ArrowRightIcon size={14} />
                </button>
              </div>
            </div>
          </div>
        </footer>
      </aside>
    </>
  );
}
