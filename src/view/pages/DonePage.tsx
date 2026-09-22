import { useState } from "preact/hooks";
import type { Card, DoneResponse, Health } from "../../api/state.ts";
import { type CardActions, CardActionsContext } from "../components/cardActions.ts";
import { HistoryModal } from "../components/HistoryModal.tsx";
import { InfoModal } from "../components/InfoModal.tsx";
import { InfoIcon } from "../components/icons.tsx";
import { Lane } from "../components/Lane.tsx";

/**
 * 完了ページ（/done）。クローズ済み（Done）のアイテムをリポジトリごとのレーンで並べる。
 *
 * 状態は変わらない終端なので SSR のみでポーリングしない。
 * ヘッダーはメインページと揃える（info アイコンで API/システム情報を見られる）。
 */
export function DonePage({ done, health }: { done: DoneResponse; health: Health }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [historyCard, setHistoryCard] = useState<Card | null>(null);

  const actions: CardActions = { openHistory: setHistoryCard };

  return (
    <CardActionsContext.Provider value={actions}>
      <header>
        <h1>Autopilot</h1>
        <button
          type="button"
          class="icon-btn"
          aria-label="システム・API情報"
          title="システム・API情報"
          onClick={() => setInfoOpen(true)}
        >
          <InfoIcon />
        </button>
        <a class="header-link" href="/">
          ← ダッシュボード
        </a>
      </header>

      <main class="by-repo">
        {done.repos.length === 0 ? (
          <div class="empty">完了したタスクはありません</div>
        ) : (
          done.repos.map((g) => (
            <Lane key={g.repo} title={`${g.repo} (${g.cards.length})`} cards={g.cards} open />
          ))
        )}
      </main>

      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} health={health} />
      <HistoryModal card={historyCard} onClose={() => setHistoryCard(null)} />
    </CardActionsContext.Provider>
  );
}
