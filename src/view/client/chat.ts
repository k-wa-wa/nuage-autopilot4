import type { Card } from "../../api/state.ts";
import { ago, esc } from "./utils.ts";

let currentChatCard: Card | null = null;
let currentConversationId: string | null = null;
let isChatStreaming = false;

export function renderSimpleMarkdown(text: string): string {
  const e = (str: string) =>
    str.replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c,
    );

  const codeBlocks: string[] = [];
  let processed = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${e(code.trim())}</code></pre>`);
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Issue ドラフトプレビューカードの描画
  processed = processed.replace(
    /<!-- ISSUE_DRAFT_START -->([\s\S]*?)<!-- ISSUE_DRAFT_END -->/g,
    (_match, content) => {
      let title = "";
      let repo = "";
      const titleMatch = content.match(/\*\*タイトル\*\*:\s*([^\n]+)/);
      if (titleMatch) title = titleMatch[1].trim();
      const repoMatch = content.match(/\*\*対象リポジトリ\*\*:\s*([^\n]+)/);
      if (repoMatch) repo = repoMatch[1].trim();

      const bodyContent = content
        .replace(/\*\*タイトル\*\*:\s*[^\n]+\n?/, "")
        .replace(/\*\*対象リポジトリ\*\*:\s*[^\n]+\n?/, "")
        .trim();

      let bodyHtml = e(bodyContent);
      bodyHtml = bodyHtml.replace(
        /^#### (.*$)/gim,
        '<div style="font-weight:600;margin-top:10px;margin-bottom:4px;color:var(--fg);">$1</div>',
      );
      bodyHtml = bodyHtml.replace(
        /^### (.*$)/gim,
        '<div style="font-weight:600;margin-top:10px;margin-bottom:4px;color:var(--fg);">$1</div>',
      );
      bodyHtml = bodyHtml.replace(
        /^\s*[-*]\s+\[ \]\s+(.*$)/gim,
        '<div style="display:flex;align-items:center;gap:6px;margin:2px 0;"><span style="color:var(--muted)">☐</span><span>$1</span></div>',
      );
      bodyHtml = bodyHtml.replace(
        /^\s*[-*]\s+\[x\]\s+(.*$)/gim,
        '<div style="display:flex;align-items:center;gap:6px;margin:2px 0;"><span style="color:var(--accent)">☑</span><span>$1</span></div>',
      );
      bodyHtml = bodyHtml.replace(/^\s*[-*]\s+(.*$)/gim, '<li style="margin-left:14px;">$1</li>');
      bodyHtml = bodyHtml.replace(/\n\n/g, "<br>");

      const idx = codeBlocks.length;
      codeBlocks.push(
        `<div class="issue-draft-card" data-repo="${e(repo)}" data-title="${e(title)}">` +
          `<div class="issue-draft-header">` +
          `<span class="issue-draft-badge">📋 GitHub Issue ドラフト</span>` +
          `</div>` +
          `<div class="issue-draft-title">${e(title)}</div>` +
          `<div class="issue-draft-repo">対象: <code>${e(repo)}</code></div>` +
          `<div class="issue-draft-content" style="margin: 10px 0; font-size: 12px; line-height: 1.5; color: var(--fg); opacity: 0.9;">${bodyHtml}</div>` +
          `<div class="issue-create-action">` +
          `<button type="button" class="issue-create-btn" data-action="create-issue">🚀 GitHub Issue を起票</button>` +
          `</div>` +
          `<textarea class="issue-draft-raw-body" style="display: none;">${e(bodyContent)}</textarea>` +
          `</div>`,
      );
      return `%%CODEBLOCK_${idx}%%`;
    },
  );

  processed = processed.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  processed = processed.replace(/^## (.*$)/gim, "<h3>$1</h3>");
  processed = processed.replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>");
  processed = processed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  processed = processed.replace(/`([^`]+)`/g, (_match, code) => `<code>${e(code)}</code>`);
  processed = processed.replace(/^\s*[-*]\s+(.*$)/gim, "<li>$1</li>");
  processed = processed.replace(/\n\n/g, "<br><br>");

  processed = processed.replace(
    /%%CODEBLOCK_(\d+)%%/g,
    (_match, idx) => codeBlocks[Number(idx)] || "",
  );

  return processed;
}

export function updateChatModeUI(mode: "investigate" | "brainstorm"): void {
  const investigateActions = document.getElementById("quick-actions-investigate");
  const brainstormActions = document.getElementById("quick-actions-brainstorm");
  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;

  if (investigateActions) {
    investigateActions.style.display = mode === "investigate" ? "flex" : "none";
  }
  if (brainstormActions) {
    brainstormActions.style.display = mode === "brainstorm" ? "flex" : "none";
  }

  if (chatInput) {
    if (currentChatCard) {
      chatInput.placeholder =
        mode === "brainstorm"
          ? `${currentChatCard.repo}#${currentChatCard.issue_number} について新機能やリファクタリングの相談を入力...`
          : `${currentChatCard.repo}#${currentChatCard.issue_number} について指示を入力、またはこのまま送信...`;
    } else {
      chatInput.placeholder =
        mode === "brainstorm"
          ? "新機能のアイデアや設計の相談を入力... (Enterで送信, Shift+Enterで改行)"
          : "質問や指示を入力... (Enterで送信, Shift+Enterで改行)";
    }
  }
}

export function renderContextChips(): void {
  const chatContextChips = document.getElementById("chat-context-chips");
  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  const chatModeSelect = document.getElementById("chat-mode-select") as HTMLSelectElement | null;
  if (!chatContextChips) return;
  const mode = (chatModeSelect?.value as "investigate" | "brainstorm") || "investigate";

  if (!currentChatCard) {
    chatContextChips.innerHTML = "";
    chatContextChips.style.display = "none";
    if (chatInput) {
      chatInput.placeholder =
        mode === "brainstorm"
          ? "新機能のアイデアや設計の相談を入力... (Enterで送信, Shift+Enterで改行)"
          : "質問や指示を入力... (Enterで送信, Shift+Enterで改行)";
    }
    return;
  }

  const c = currentChatCard;
  const cardKey = `${c.repo}#${c.issue_number}`;
  let html = "";

  html += `
    <div class="agy-chip issue-chip" title="アタッチされたコンテキスト">
      <span class="chip-icon">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.69C0 12.48.52 13 1.15 13h13.69c.64 0 1.15-.52 1.15-1.15V4.15C16 3.52 15.48 3 14.85 3zM9 11H7V8L5.5 9.9 4 8v3H2V5h2l1.5 2L7 5h2v6zm2.99.5L9.5 8H11V5h2v3h1.5l-2.51 3.5z"/></svg>
      </span>
      <span class="chip-text">${esc(cardKey)}</span>
      <button type="button" class="chip-close" data-remove="card" title="コンテキストを解除">×</button>
    </div>
  `;

  if (c.error_detail) {
    const summaryShort =
      c.error_detail.summary.length > 28
        ? `${c.error_detail.summary.slice(0, 28)}…`
        : c.error_detail.summary;
    html += `
      <div class="agy-chip error-chip" title="直近のエラー情報">
        <span class="chip-icon">⚠️</span>
        <span class="chip-text">Error: ${esc(summaryShort)}</span>
      </div>
    `;
  }

  chatContextChips.innerHTML = html;
  chatContextChips.style.display = "flex";

  if (chatInput) {
    chatInput.placeholder =
      mode === "brainstorm"
        ? `${c.repo}#${c.issue_number} について新機能やリファクタリングの相談を入力...`
        : `${c.repo}#${c.issue_number} について指示を入力、またはこのまま送信...`;
  }
}

let initialWelcomeHtml = "";

export function resetChatToWelcome(): void {
  currentConversationId = null;
  const chatMessages = document.getElementById("chat-messages");
  if (chatMessages && initialWelcomeHtml) {
    chatMessages.innerHTML = initialWelcomeHtml;
    const modeSelect = document.getElementById("chat-mode-select") as HTMLSelectElement | null;
    const mode = (modeSelect?.value as "investigate" | "brainstorm") || "investigate";
    updateChatModeUI(mode);
  }
  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  if (chatInput) {
    chatInput.value = "";
    chatInput.focus();
  }
}

export async function restoreConversationById(convId: string): Promise<boolean> {
  const chatMessages = document.getElementById("chat-messages");
  if (!chatMessages) return false;

  try {
    const detailRes = await fetch(`/api/chat/conversations/${convId}`);
    if (!detailRes.ok) return false;
    const detailData = (await detailRes.json()) as {
      conversation?: { id: string; engine?: string; mode?: string };
      messages?: Array<{ role: string; content: string }>;
    };
    const conv = detailData.conversation;
    const messages = detailData.messages || [];

    if (!conv || messages.length === 0) return false;

    currentConversationId = conv.id;

    // エンジン・モードの同期
    const chatEngineSelect = document.getElementById(
      "chat-engine-select",
    ) as HTMLSelectElement | null;
    if (chatEngineSelect && conv.engine) {
      chatEngineSelect.value = conv.engine;
    }
    const chatModeSelect = document.getElementById("chat-mode-select") as HTMLSelectElement | null;
    if (chatModeSelect && conv.mode) {
      chatModeSelect.value = conv.mode;
      updateChatModeUI(conv.mode as "investigate" | "brainstorm");
    }

    // メッセージ描画
    chatMessages.innerHTML = "";
    for (const msg of messages) {
      const msgDiv = document.createElement("div");
      msgDiv.className = `chat-msg ${msg.role}`;
      const bubbleDiv = document.createElement("div");
      bubbleDiv.className = "msg-bubble";
      if (msg.role === "assistant") {
        bubbleDiv.innerHTML = renderSimpleMarkdown(msg.content);
      } else {
        bubbleDiv.textContent = msg.content;
      }
      msgDiv.appendChild(bubbleDiv);
      chatMessages.appendChild(msgDiv);
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return true;
  } catch {
    return false;
  }
}

export async function loadConversationHistory(card: Card | null): Promise<void> {
  const repo = card?.repo ?? "";
  const issueNumber = card?.issue_number ?? 0;

  try {
    const listRes = await fetch(
      `/api/chat/conversations?repo=${encodeURIComponent(repo)}&issue=${issueNumber}`,
    );
    if (!listRes.ok) return;
    const listData = (await listRes.json()) as {
      conversations?: Array<{ id: string }>;
    };
    const latestConv = listData.conversations?.[0];
    if (!latestConv) {
      resetChatToWelcome();
      return;
    }

    const restored = await restoreConversationById(latestConv.id);
    if (!restored) {
      resetChatToWelcome();
    }
  } catch {
    // 取得エラー時は初期表示を維持
  }
}

export async function toggleChatHistoryPopover(): Promise<void> {
  const popover = document.getElementById("chat-history-popover");
  const listEl = document.getElementById("chat-history-list");
  if (!popover || !listEl) return;

  if (popover.style.display === "flex") {
    popover.style.display = "none";
    return;
  }

  const repo = currentChatCard?.repo ?? "";
  const issueNumber = currentChatCard?.issue_number ?? 0;

  try {
    const res = await fetch(
      `/api/chat/conversations?repo=${encodeURIComponent(repo)}&issue=${issueNumber}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      conversations?: Array<{
        id: string;
        title?: string;
        mode?: string;
        engine?: string;
        updated_at?: string;
      }>;
    };
    const conversations = data.conversations || [];

    if (conversations.length === 0) {
      listEl.innerHTML = '<div class="chat-history-empty">過去の会話履歴はありません</div>';
    } else {
      listEl.innerHTML = conversations
        .map((c) => {
          const isActive = currentConversationId === c.id;
          const modeLabel = c.mode === "brainstorm" ? "💡 壁打ち" : "🔍 調査";
          const engineLabel = c.engine === "claude" ? "Claude" : "AGY";
          const timeAgo = ago(c.updated_at || null);
          return `
            <div class="chat-history-item ${isActive ? "active" : ""}" data-id="${esc(c.id)}">
              <div class="chat-history-item-title">${esc(c.title || "Autopilot Chat")}</div>
              <div class="chat-history-meta">
                <span class="chat-history-badge">${modeLabel}</span>
                <span class="chat-history-badge">${engineLabel}</span>
                <span>${timeAgo}</span>
              </div>
            </div>
          `;
        })
        .join("");
    }

    popover.style.display = "flex";
  } catch {
    // エラー時は表示しない
  }
}

export function openChat(card?: Card | null, mode?: "investigate" | "brainstorm"): void {
  const chatPane = document.getElementById("chat-pane");
  const paneResizer = document.getElementById("pane-resizer");
  const chatModeSelect = document.getElementById("chat-mode-select") as HTMLSelectElement | null;
  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;

  if (!chatPane || !paneResizer) return;
  currentChatCard = card || null;

  if (mode && chatModeSelect) {
    chatModeSelect.value = mode;
    updateChatModeUI(mode);
  } else if (card && chatModeSelect) {
    chatModeSelect.value = "investigate";
    updateChatModeUI("investigate");
  }

  const saved = localStorage.getItem("autopilot_chat_pane_width");
  if (saved) {
    const w = Number.parseInt(saved, 10);
    if (!Number.isNaN(w) && w >= 280 && w <= window.innerWidth * 0.8) {
      chatPane.style.width = `${w}px`;
    }
  }

  chatPane.style.display = "flex";
  paneResizer.style.display = "block";
  chatPane.setAttribute("aria-hidden", "false");

  renderContextChips();
  chatInput?.focus();

  // 過去の会話履歴をロードして画面に復元
  void loadConversationHistory(currentChatCard);
}

export function closeChat(): void {
  const chatPane = document.getElementById("chat-pane");
  const paneResizer = document.getElementById("pane-resizer");
  if (!chatPane || !paneResizer) return;
  chatPane.style.display = "none";
  paneResizer.style.display = "none";
  chatPane.setAttribute("aria-hidden", "true");
}

export function toggleChat(): void {
  const chatPane = document.getElementById("chat-pane");
  if (chatPane && chatPane.style.display === "flex") {
    closeChat();
  } else {
    openChat(currentChatCard);
  }
}

export async function startChatInvestigation(userPrompt: string): Promise<void> {
  const chatMessages = document.getElementById("chat-messages");
  const chatSendBtn = document.getElementById("chat-send-btn") as HTMLButtonElement | null;
  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  const chatEngineSelect = document.getElementById(
    "chat-engine-select",
  ) as HTMLSelectElement | null;
  const chatModeSelect = document.getElementById("chat-mode-select") as HTMLSelectElement | null;

  if (isChatStreaming || !chatMessages) return;
  isChatStreaming = true;
  if (chatSendBtn) chatSendBtn.disabled = true;

  const snapshotCard = currentChatCard;
  currentChatCard = null;
  renderContextChips();
  if (chatInput) chatInput.value = "";

  const selectedMode = (chatModeSelect?.value as "investigate" | "brainstorm") || "investigate";
  const promptToSend =
    userPrompt.trim() ||
    (selectedMode === "brainstorm"
      ? snapshotCard
        ? `${snapshotCard.repo}#${snapshotCard.issue_number} の新機能やリファクタリング方針について壁打ちさせてください。`
        : "新機能の設計やリファクタリングについて壁打ちさせてください。"
      : snapshotCard?.error_detail
        ? `直近のエラー「${snapshotCard.error_detail.summary}」の原因と対処法を調査してください。`
        : snapshotCard
          ? `このアイテムが現在「${snapshotCard.display_hint}」となっている原因と現在の状況を調査してください。`
          : "システム全体の状況を調査してください。");

  // ウェルカム表示があれば削除
  const welcomeEl = chatMessages.querySelector(".chat-welcome-msg");
  if (welcomeEl) {
    welcomeEl.remove();
  }

  // ユーザーメッセージ追加
  const userDiv = document.createElement("div");
  userDiv.className = "chat-msg user";
  let pinHtml = "";
  if (snapshotCard) {
    pinHtml = `<div class="msg-context-pin">📎 ${esc(snapshotCard.repo)}#${snapshotCard.issue_number}</div>`;
  }
  userDiv.innerHTML = `${pinHtml}<div class="msg-bubble">${esc(userPrompt.trim() || promptToSend)}</div>`;
  chatMessages.appendChild(userDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // アシスタント返信要素
  const assistantDiv = document.createElement("div");
  assistantDiv.className = "chat-msg assistant";

  const thinkingAccordion = document.createElement("details");
  thinkingAccordion.className = "thinking-accordion";
  thinkingAccordion.open = true;
  thinkingAccordion.innerHTML =
    '<summary>💭 Thinking (思考中...)</summary><pre class="thinking-content"></pre>';
  const thinkingPre = thinkingAccordion.querySelector(".thinking-content") as HTMLPreElement;

  const toolContainer = document.createElement("div");
  toolContainer.className = "tool-call-container";

  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "msg-bubble";
  bubbleDiv.innerHTML =
    selectedMode === "brainstorm"
      ? '<span class="meta">思考中... 設計・仕様を整理しています</span>'
      : '<span class="meta">調査中...</span>';

  assistantDiv.appendChild(thinkingAccordion);
  assistantDiv.appendChild(toolContainer);
  assistantDiv.appendChild(bubbleDiv);
  chatMessages.appendChild(assistantDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  let rawText = "";
  let rawThinking = "";

  try {
    const selectedEngine = (chatEngineSelect?.value as "agy" | "claude") || "agy";
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: promptToSend,
        card: snapshotCard || undefined,
        conversation_id: currentConversationId || undefined,
        engine: selectedEngine,
        mode: selectedMode,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}: チャット接続に失敗しました`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "message";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (currentEvent === "init" && data.conversation_id) {
              currentConversationId = data.conversation_id;
            } else if (currentEvent === "thought" && data.delta) {
              rawThinking += data.delta;
              thinkingPre.textContent = rawThinking;
              chatMessages.scrollTop = chatMessages.scrollHeight;
            } else if (currentEvent === "tool_start") {
              const badge = document.createElement("div");
              badge.className = "tool-call-badge";
              badge.id = `tool-${data.id || data.name}`;
              badge.innerHTML = `<span class="tool-icon">🛠️</span> <span><code>${esc(data.name)}</code></span> <span class="tool-status running">実行中...</span>`;
              toolContainer.appendChild(badge);
              chatMessages.scrollTop = chatMessages.scrollHeight;
            } else if (currentEvent === "tool_end") {
              const badge = document.getElementById(`tool-${data.id || data.name}`);
              if (badge) {
                const status = badge.querySelector(".tool-status");
                if (status) {
                  status.className = "tool-status done";
                  status.textContent = "完了";
                }
              }
            } else if (currentEvent === "text" && data.delta) {
              rawText += data.delta;
              bubbleDiv.innerHTML = renderSimpleMarkdown(rawText);
              chatMessages.scrollTop = chatMessages.scrollHeight;
            } else if (currentEvent === "done") {
              const summary = thinkingAccordion.querySelector("summary");
              if (summary) summary.innerHTML = "💭 Thinking (完了)";
            } else if (currentEvent === "error") {
              bubbleDiv.innerHTML += `<div style="color: var(--warn); margin-top: 8px;">⚠️ エラー: ${esc(data.message)}</div>`;
            }
          } catch {
            // json パースエラー無視
          }
        }
      }
    }
  } catch (err) {
    bubbleDiv.innerHTML = `<div style="color: var(--warn);">⚠️ 調査中にエラーが発生しました: ${esc(String(err))}</div>`;
  } finally {
    isChatStreaming = false;
    if (chatSendBtn) chatSendBtn.disabled = false;
    chatInput?.focus();
  }
}

export function initChat(): void {
  const chatPane = document.getElementById("chat-pane");
  const paneResizer = document.getElementById("pane-resizer");
  const chatCloseBtn = document.getElementById("chat-close-btn");
  const chatNewBtn = document.getElementById("chat-new-btn");
  const chatHistoryBtn = document.getElementById("chat-history-btn");
  const chatHeaderBtn = document.getElementById("chat-header-btn");
  const chatMessages = document.getElementById("chat-messages");
  const chatContextChips = document.getElementById("chat-context-chips");
  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  const chatSendBtn = document.getElementById("chat-send-btn") as HTMLButtonElement | null;

  if (chatMessages && !initialWelcomeHtml) {
    initialWelcomeHtml = chatMessages.innerHTML;
  }

  if (chatNewBtn) {
    chatNewBtn.addEventListener("click", () => {
      resetChatToWelcome();
    });
  }

  if (chatHistoryBtn) {
    chatHistoryBtn.addEventListener("click", () => {
      void toggleChatHistoryPopover();
    });
  }

  // 履歴ポップオーバー内のアイテム選択
  const historyList = document.getElementById("chat-history-list");
  if (historyList) {
    historyList.addEventListener("click", async (e) => {
      const target = e.target as HTMLElement | null;
      const item = target?.closest(".chat-history-item") as HTMLElement | null;
      if (item) {
        const id = item.getAttribute("data-id");
        if (id) {
          await restoreConversationById(id);
          const popover = document.getElementById("chat-history-popover");
          if (popover) popover.style.display = "none";
        }
      }
    });
  }

  // ポップオーバー外クリックで閉じる
  document.addEventListener("click", (e) => {
    const popover = document.getElementById("chat-history-popover");
    const historyBtn = document.getElementById("chat-history-btn");
    if (!popover || popover.style.display === "none") return;
    const target = e.target as HTMLElement | null;
    if (target && !popover.contains(target) && !historyBtn?.contains(target)) {
      popover.style.display = "none";
    }
  });
  const chatEngineSelect = document.getElementById(
    "chat-engine-select",
  ) as HTMLSelectElement | null;
  const chatModeSelect = document.getElementById("chat-mode-select") as HTMLSelectElement | null;

  if (chatModeSelect) {
    const savedMode = localStorage.getItem("autopilot_chat_mode");
    if (savedMode === "investigate" || savedMode === "brainstorm") {
      chatModeSelect.value = savedMode;
      updateChatModeUI(savedMode);
    }
    chatModeSelect.addEventListener("change", () => {
      const mode = (chatModeSelect.value as "investigate" | "brainstorm") || "investigate";
      localStorage.setItem("autopilot_chat_mode", mode);
      updateChatModeUI(mode);
    });
  }

  if (chatEngineSelect) {
    const savedEngine = localStorage.getItem("autopilot_chat_engine");
    if (savedEngine === "agy" || savedEngine === "claude") {
      chatEngineSelect.value = savedEngine;
    }
    chatEngineSelect.addEventListener("change", () => {
      localStorage.setItem("autopilot_chat_engine", chatEngineSelect.value);
      currentConversationId = null;
    });
  }

  if (chatContextChips) {
    chatContextChips.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const removeBtn = target.closest(".chip-close");
      if (removeBtn) {
        e.stopPropagation();
        currentChatCard = null;
        renderContextChips();
      }
    });
  }

  // Issue ドラフト起票ボタンのイベントデリゲーション
  if (chatMessages) {
    chatMessages.addEventListener("click", async (e) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest('button[data-action="create-issue"]') as HTMLButtonElement | null;
      if (!btn) return;

      const draftCard = btn.closest(".issue-draft-card") as HTMLElement | null;
      if (!draftCard) return;

      const repo = draftCard.getAttribute("data-repo") || "";
      const title = draftCard.getAttribute("data-title") || "";
      const bodyEl = draftCard.querySelector(".issue-draft-raw-body") as HTMLTextAreaElement | null;
      const body = bodyEl?.value || "";

      if (!repo || !title) return;

      const actionArea = draftCard.querySelector(".issue-create-action") as HTMLElement | null;
      if (!actionArea) return;

      btn.disabled = true;
      btn.textContent = "起票中...";

      try {
        const res = await fetch("/api/issue/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo, title, body }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        actionArea.innerHTML = `
          <a href="${esc(data.url)}" target="_blank" rel="noopener noreferrer" class="issue-created-badge" title="GitHub で開く">
            <span>✅ Issue #${esc(data.issue_number)} を起票しました</span>
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.75.75a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0V3.56l-4.22 4.22a.75.75 0 0 1-1.06-1.06l4.22-4.22H11.25a.75.75 0 0 1-.75-.75z"/>
            </svg>
          </a>
        `;
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "🚀 GitHub Issue を起票";
        let errDiv = actionArea.querySelector(".issue-create-error") as HTMLElement | null;
        if (!errDiv) {
          errDiv = document.createElement("div");
          errDiv.className = "issue-create-error";
          errDiv.style.color = "var(--warn)";
          errDiv.style.fontSize = "11px";
          errDiv.style.marginTop = "4px";
          actionArea.appendChild(errDiv);
        }
        errDiv.textContent = `起票エラー: ${String(err)}`;
      }
    });
  }

  // スプリッターリサイズ
  if (paneResizer && chatPane) {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    paneResizer.addEventListener("mousedown", (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = chatPane.getBoundingClientRect().width;
      paneResizer.classList.add("resizing");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const dx = startX - e.clientX;
      const minW = 280;
      const maxW = Math.max(minW, Math.floor(window.innerWidth * 0.75));
      const newWidth = Math.max(minW, Math.min(maxW, startWidth + dx));
      chatPane.style.width = `${newWidth}px`;
      localStorage.setItem("autopilot_chat_pane_width", String(Math.round(newWidth)));
    });

    document.addEventListener("mouseup", () => {
      if (!isResizing) return;
      isResizing = false;
      paneResizer.classList.remove("resizing");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    });
  }

  if (chatCloseBtn) chatCloseBtn.addEventListener("click", closeChat);
  if (chatHeaderBtn) chatHeaderBtn.addEventListener("click", toggleChat);

  // クイック質問チップスクリック（入力欄にセットしフォーカス）
  document.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement | null)?.closest(".quick-chip") as HTMLElement | null;
    if (chip) {
      const prompt = chip.getAttribute("data-prompt");
      if (prompt) {
        if (chatPane?.style.display !== "flex") {
          openChat(null);
        }
        if (chatInput) {
          chatInput.value = prompt;
          chatInput.focus();
          chatInput.setSelectionRange(prompt.length, prompt.length);
        }
      }
    }
  });

  const handleComposerSubmit = () => {
    if (!chatInput || isChatStreaming) return;
    const val = chatInput.value;
    chatInput.value = "";
    void startChatInvestigation(val);
  };

  if (chatSendBtn) {
    chatSendBtn.addEventListener("click", handleComposerSubmit);
  }

  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleComposerSubmit();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && chatPane && chatPane.style.display === "flex") {
      closeChat();
    }
  });
}
