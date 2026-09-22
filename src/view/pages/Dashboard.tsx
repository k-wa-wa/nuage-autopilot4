import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Card, StateResponse } from "../../api/state.ts";
import { Banner } from "../components/Banner.tsx";
import { type CardActions, CardActionsContext } from "../components/cardActions.ts";
import { ChatPane } from "../components/chat/ChatPane.tsx";
import { useChat } from "../components/chat/useChat.ts";
import { ErrorModal } from "../components/ErrorModal.tsx";
import { HistoryModal } from "../components/HistoryModal.tsx";
import { InfoModal } from "../components/InfoModal.tsx";
import { InfoIcon, SparklesIcon } from "../components/icons.tsx";
import { Lane } from "../components/Lane.tsx";
import { RelationConnectors } from "../components/RelationConnectors.tsx";
import { SystemErrorModal } from "../components/SystemErrorModal.tsx";
import { cardKeyOf } from "../utils.ts";

const POLL_INTERVAL_MS = 4000;

type ModalState =
  | { kind: "info" }
  | { kind: "system" }
  | { kind: "error"; card: Card }
  | { kind: "history"; card: Card }
  | null;

function usePolledState(initial: StateResponse) {
  const [state, setState] = useState(initial);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = async () => {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setState((await res.json()) as StateResponse);
        setOffline(false);
      } catch {
        setOffline(true);
      }
    };
    const start = () => {
      clearInterval(timer);
      timer = setInterval(refresh, POLL_INTERVAL_MS);
    };
    const onVisibility = () => {
      clearInterval(timer);
      if (!document.hidden) {
        void refresh();
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { state, offline };
}

export function Dashboard({ initialState }: { initialState: StateResponse }) {
  const { state, offline } = usePolledState(initialState);
  const chat = useChat();
  const [modal, setModal] = useState<ModalState>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const cardElements = useRef(new Map<string, HTMLElement>()).current;

  const { lanes, health } = state;
  const allCards = useMemo(
    () => [...lanes.action_required, ...lanes.working, ...lanes.queued, ...lanes.backlog],
    [lanes],
  );

  // モーダルを開いたままポーリングで更新されたら最新のカードを見せる（消えたら開いた時点の値）
  const latest = (card: Card) => allCards.find((c) => cardKeyOf(c) === cardKeyOf(card)) ?? card;
  const closeModal = () => setModal(null);

  const actions: CardActions = {
    openChat: (card) => chat.openWith(card),
    openError: (card) => setModal({ kind: "error", card }),
    openHistory: (card) => setModal({ kind: "history", card }),
    hover: setHoverKey,
    registerElement: (key, el) => {
      if (el) cardElements.set(key, el);
      else cardElements.delete(key);
    },
  };

  return (
    <CardActionsContext.Provider value={actions}>
      <div class="app-layout">
        <div class="main-pane">
          <header>
            <h1>Autopilot</h1>
            <button
              type="button"
              class="icon-btn"
              aria-label="システム・API情報"
              title="システム・API情報"
              onClick={() => setModal({ kind: "info" })}
            >
              <InfoIcon />
            </button>
            <button
              type="button"
              class="icon-btn header-chat-btn"
              aria-label="Autopilot Chat を開閉"
              title="Autopilot Chat を開閉"
              onClick={chat.toggle}
            >
              <SparklesIcon size={14} />
            </button>
            <a class="header-link" href="/done">
              完了タスクを見る
            </a>
          </header>

          <Banner
            degraded={health.degraded}
            offline={offline}
            onOpenDetail={() => setModal({ kind: "system" })}
          />

          <main>
            <Lane title="🧑 Action Required" cards={lanes.action_required} open />
            <Lane title="🤖 Working" cards={lanes.working} open />
            <Lane title="📦 Queued" cards={lanes.queued} open />
            <Lane title="📥 Backlog" cards={lanes.backlog} />
          </main>
        </div>

        <ChatPane chat={chat} />
      </div>

      <RelationConnectors hoverKey={hoverKey} cards={allCards} elements={cardElements} />

      <InfoModal open={modal?.kind === "info"} onClose={closeModal} health={health} />
      <SystemErrorModal open={modal?.kind === "system"} onClose={closeModal} health={health} />
      <ErrorModal card={modal?.kind === "error" ? latest(modal.card) : null} onClose={closeModal} />
      <HistoryModal
        card={modal?.kind === "history" ? latest(modal.card) : null}
        onClose={closeModal}
      />
    </CardActionsContext.Provider>
  );
}
