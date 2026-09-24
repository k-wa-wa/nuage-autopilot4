import { useEffect, useRef, useState } from "preact/hooks";
import type { Card } from "../../../api/state.ts";
import { cardKeyOf } from "../../utils.ts";
import { createSseParser, type SseEvent } from "./sse.ts";

export type ChatMode = "investigate" | "brainstorm";
export type ChatEngine = "agy" | "claude";

export interface ToolCall {
  id: string;
  name: string;
  /** コマンド内容やファイルパスなど、引数から抽出した一行サマリー。完了状態は追跡しない。 */
  detail: string;
}

/** ツール引数オブジェクトから、バッジ表示用の一行サマリーを best-effort で抽出する。 */
function summarizeToolArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const obj = args as Record<string, unknown>;
  const preferredKeys = [
    "command",
    "CommandLine",
    "cmd",
    "file_path",
    "path",
    "pattern",
    "query",
    "url",
    "description",
  ];
  for (const key of preferredKeys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  const firstString = Object.values(obj).find((v) => typeof v === "string" && v.trim());
  return typeof firstString === "string" ? firstString : "";
}

/** ストリーミング中に受け取った途中経過。履歴から復元した発言は持たない。 */
export interface LiveProgress {
  thinking: string;
  thinkingDone: boolean;
  tools: ToolCall[];
  streaming: boolean;
  pendingLabel: string;
}

export type ChatEntry =
  | { id: number; role: "user"; text: string; pin: string | null }
  | {
      id: number;
      role: "assistant";
      text: string;
      live: LiveProgress | null;
      error: string | null;
    };

type AssistantEntry = Extract<ChatEntry, { role: "assistant" }>;

export interface ConversationSummary {
  id: string;
  title?: string;
  mode?: string;
  engine?: string;
  updated_at?: string;
}

interface ConversationDetail {
  conversation?: { id: string; engine?: string; mode?: string };
  messages?: Array<{ role: string; content: string }>;
}

const MODE_STORAGE_KEY = "autopilot_chat_mode";
const ENGINE_STORAGE_KEY = "autopilot_chat_engine";

const isMode = (v: unknown): v is ChatMode => v === "investigate" || v === "brainstorm";
const isEngine = (v: unknown): v is ChatEngine => v === "agy" || v === "claude";

function defaultPrompt(mode: ChatMode, card: Card | null): string {
  if (mode === "brainstorm") {
    return card
      ? `${cardKeyOf(card)} の新機能やリファクタリング方針について壁打ちさせてください。`
      : "新機能の設計やリファクタリングについて壁打ちさせてください。";
  }
  if (card?.error_detail) {
    return `直近のエラー「${card.error_detail.summary}」の原因と対処法を調査してください。`;
  }
  if (card) {
    return `このアイテムが現在「${card.display_hint}」となっている原因と現在の状況を調査してください。`;
  }
  return "システム全体の状況を調査してください。";
}

async function fetchConversations(card: Card | null): Promise<ConversationSummary[]> {
  const repo = card?.repo ?? "";
  const issue = card?.issue_number ?? 0;
  const res = await fetch(
    `/api/chat/conversations?repo=${encodeURIComponent(repo)}&issue=${issue}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { conversations?: ConversationSummary[] };
  return data.conversations ?? [];
}

function applyEvent(entry: AssistantEntry, ev: SseEvent): AssistantEntry {
  const live = entry.live;
  if (!live) return entry;
  const data = (ev.data ?? {}) as {
    delta?: string;
    id?: string;
    name?: string;
    args?: unknown;
    message?: string;
  };
  switch (ev.event) {
    case "thought":
      return data.delta
        ? { ...entry, live: { ...live, thinking: live.thinking + data.delta } }
        : entry;
    case "tool_start": {
      const tool: ToolCall = {
        id: data.id || data.name || "",
        name: data.name || "",
        detail: summarizeToolArgs(data.args),
      };
      return { ...entry, live: { ...live, tools: [...live.tools, tool] } };
    }
    case "text":
      return data.delta ? { ...entry, text: entry.text + data.delta } : entry;
    case "done":
      return { ...entry, live: { ...live, thinkingDone: true } };
    case "error":
      return { ...entry, error: `エラー: ${data.message ?? "不明なエラー"}` };
    default:
      return entry;
  }
}

export function useChat() {
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [mode, setModeState] = useState<ChatMode>("investigate");
  // 一旦 autopilot chat から利用できるエージェントは claude に絞る
  const [engine, setEngineState] = useState<ChatEngine>("claude");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const nextId = useRef(0);

  // localStorage はブラウザにしかないので、SSR と一致させたままハイドレーション後に読む
  useEffect(() => {
    const savedMode = localStorage.getItem(MODE_STORAGE_KEY);
    if (isMode(savedMode)) setModeState(savedMode);
    // 一旦 claude 固定。過去の agy 設定が残っていれば claude に更新
    const savedEngine = localStorage.getItem(ENGINE_STORAGE_KEY);
    if (savedEngine === "claude") {
      setEngineState("claude");
    } else {
      localStorage.setItem(ENGINE_STORAGE_KEY, "claude");
      setEngineState("claude");
    }
  }, []);

  const setMode = (next: ChatMode) => {
    localStorage.setItem(MODE_STORAGE_KEY, next);
    setModeState(next);
  };

  const setEngine = (next: ChatEngine) => {
    localStorage.setItem(ENGINE_STORAGE_KEY, next);
    setEngineState(next);
    setConversationId(null);
  };

  const reset = () => {
    setConversationId(null);
    setEntries([]);
  };

  const restore = async (id: string): Promise<boolean> => {
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(id)}`);
    if (!res.ok) return false;
    const { conversation, messages = [] } = (await res.json()) as ConversationDetail;
    if (!conversation || messages.length === 0) return false;

    setConversationId(conversation.id);
    if (isEngine(conversation.engine)) setEngineState(conversation.engine);
    if (isMode(conversation.mode)) setModeState(conversation.mode);
    setEntries(
      messages.map((m): ChatEntry => {
        const id = nextId.current++;
        return m.role === "assistant"
          ? { id, role: "assistant", text: m.content, live: null, error: null }
          : { id, role: "user", text: m.content, pin: null };
      }),
    );
    return true;
  };

  const loadLatest = async (target: Card | null) => {
    try {
      const latest = (await fetchConversations(target))[0];
      if (!latest || !(await restore(latest.id))) reset();
    } catch {
      // 取得できなければ今の表示を維持する
    }
  };

  const openWith = (target: Card | null) => {
    setCard(target);
    if (target) setModeState("investigate");
    setOpen(true);
    void loadLatest(target);
  };

  const updateAssistant = (id: number, f: (e: AssistantEntry) => AssistantEntry) => {
    setEntries((es) => es.map((e) => (e.id === id && e.role === "assistant" ? f(e) : e)));
  };

  const send = async (input: string) => {
    if (streaming) return;
    setStreaming(true);

    // 添付コンテキストは 1 回の送信で消費する
    const snapshot = card;
    setCard(null);
    const prompt = input.trim() || defaultPrompt(mode, snapshot);
    const userId = nextId.current++;
    const assistantId = nextId.current++;
    setEntries((es) => [
      ...es,
      { id: userId, role: "user", text: prompt, pin: snapshot ? cardKeyOf(snapshot) : null },
      {
        id: assistantId,
        role: "assistant",
        text: "",
        error: null,
        live: {
          thinking: "",
          thinkingDone: false,
          tools: [],
          streaming: true,
          pendingLabel:
            mode === "brainstorm" ? "思考中... 設計・仕様を整理しています" : "調査中...",
        },
      },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          card: snapshot ?? undefined,
          conversation_id: conversationId ?? undefined,
          engine,
          mode,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: チャット接続に失敗しました`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parse = createSseParser();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const ev of parse(decoder.decode(value, { stream: true }))) {
          const convId = (ev.data as { conversation_id?: string } | null)?.conversation_id;
          if ((ev.event === "init" || ev.event === "done") && convId) setConversationId(convId);
          updateAssistant(assistantId, (e) => applyEvent(e, ev));
        }
      }
    } catch (err) {
      updateAssistant(assistantId, (e) => ({
        ...e,
        error: `調査中にエラーが発生しました: ${String(err)}`,
      }));
    } finally {
      updateAssistant(assistantId, (e) =>
        e.live ? { ...e, live: { ...e.live, streaming: false } } : e,
      );
      setStreaming(false);
    }
  };

  return {
    open,
    card,
    mode,
    engine,
    conversationId,
    entries,
    streaming,
    openWith,
    toggle: () => (open ? setOpen(false) : openWith(card)),
    close: () => setOpen(false),
    clearCard: () => setCard(null),
    setMode,
    setEngine,
    reset,
    restore,
    listConversations: () => fetchConversations(card),
    send,
  };
}

export type ChatController = ReturnType<typeof useChat>;
