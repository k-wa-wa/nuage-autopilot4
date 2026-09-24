import "../../../../happydom.ts";
import { describe, expect, test } from "bun:test";
import { render } from "preact";
import { act } from "preact/test-utils";
import { ChatPane } from "./ChatPane.tsx";
import type { ChatController, ChatEntry } from "./useChat.ts";

/** useChat() が返す ChatController のうち、DOM テストで参照される最小限を満たすフェイク。 */
function fakeChat(overrides: Partial<ChatController> = {}): ChatController {
  const calls = { setMode: [] as string[], setEngine: [] as string[] };
  const base: ChatController = {
    open: true,
    card: null,
    mode: "investigate",
    engine: "agy",
    conversationId: null,
    entries: [],
    streaming: false,
    openWith: () => {},
    toggle: () => {},
    close: () => {},
    clearCard: () => {},
    setMode: (m) => calls.setMode.push(m),
    setEngine: (e) => calls.setEngine.push(e),
    reset: () => {},
    restore: async () => false,
    listConversations: async () => [],
    send: async () => {},
    ...overrides,
  };
  // biome-ignore lint/suspicious/noExplicitAny: テスト用に呼び出し履歴を生やす
  (base as any).__calls = calls;
  return base;
}

function mount(chat: ChatController) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    render(<ChatPane chat={chat} />, container);
  });
  return container;
}

describe("ChatPane (happy-dom)", () => {
  test("ツールバッジは内容(detail)のみ表示し、実行中/完了ラベルは出さない", () => {
    const entries: ChatEntry[] = [
      {
        id: 1,
        role: "assistant",
        text: "",
        error: null,
        live: {
          thinking: "",
          thinkingDone: false,
          tools: [{ id: "t1", name: "Bash", detail: "ls /tmp" }],
          streaming: true,
          pendingLabel: "調査中...",
        },
      },
    ];
    const container = mount(fakeChat({ entries }));
    const badge = container.querySelector(".tool-call-badge");
    expect(badge?.textContent).toContain("Bash");
    expect(badge?.textContent).toContain("ls /tmp");
    expect(container.querySelector(".tool-status")).toBeNull();
    expect(badge?.textContent).not.toContain("実行中");
  });

  test("モード選択の change でハンドラが呼ばれる", () => {
    const chat = fakeChat();
    const container = mount(chat);
    const select = container.querySelector<HTMLSelectElement>(".chat-mode-select");
    expect(select).not.toBeNull();
    act(() => {
      select!.value = "brainstorm";
      select!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // biome-ignore lint/suspicious/noExplicitAny: フェイクに生やした呼び出し履歴
    expect((chat as any).__calls.setMode).toEqual(["brainstorm"]);
  });

  test("モバイル幅で開いている間、body に chat-pane-locked が付き、閉じると外れる", () => {
    (window as unknown as { innerWidth: number }).innerWidth = 375;
    const chat = fakeChat({ open: true });
    const container = mount(chat);
    expect(document.body.classList.contains("chat-pane-locked")).toBe(true);

    act(() => {
      render(<ChatPane chat={{ ...chat, open: false }} />, container);
    });
    expect(document.body.classList.contains("chat-pane-locked")).toBe(false);
  });

  test("ストリーミング中で本文未達の場合、重複する思考中msg-bubbleは出さず、Thinkingアコーディオンのみ表示する", () => {
    const entries: ChatEntry[] = [
      {
        id: 1,
        role: "assistant",
        text: "",
        error: null,
        live: {
          thinking: "設計を整理中",
          thinkingDone: false,
          tools: [],
          streaming: true,
          pendingLabel: "思考中... 設計・仕様を整理しています",
        },
      },
    ];
    const container = mount(fakeChat({ entries }));
    expect(container.querySelector(".thinking-accordion")).not.toBeNull();
    expect(container.querySelector(".msg-bubble")).toBeNull();
    expect(container.textContent).not.toContain("思考中... 設計・仕様を整理しています");
  });

  test("モード選択の選択肢が 🔍 Investigate と 💡 Plan になっており、エンジン選択は Claude 固定（非表示）になっている", () => {
    const container = mount(fakeChat());
    const modeOptions = Array.from(
      container.querySelectorAll<HTMLOptionElement>(".chat-mode-select option"),
    ).map((o) => o.textContent);
    expect(modeOptions).toEqual(["🔍 Investigate", "💡 Plan"]);

    // 一旦 autopilot chat は claude に絞るため、エンジン選択UIは非表示
    expect(container.querySelector(".agy-engine-select")).toBeNull();
  });
});
