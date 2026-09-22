import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import type { DoneResponse, Health } from "../api/state.ts";
import { HistoryModalDialog } from "./components/HistoryModal.tsx";
import { InfoModalDialog } from "./components/InfoModal.tsx";
import { InfoIcon } from "./components/icons.tsx";
import { LaneComponent } from "./components/Lane.tsx";
import { styles } from "./styles.ts";

/**
 * 完了ページ（/done）。クローズ済み（Done）のアイテムをリポジトリごとのレーンで並べる。
 *
 * 状態は変わらない終端なので SSR のみでポーリングしない。
 * ヘッダーはメインページと揃える（info アイコンで API/システム情報を見られる）。
 */

export interface DonePageProps {
  state: DoneResponse;
  health: Health;
}

export const DonePage: FC<DonePageProps> = ({ state, health }) => {
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Autopilot - 完了</title>
        <style>{raw(styles)}</style>
      </head>
      <body data-page="done">
        <header>
          <h1>Autopilot</h1>
          <button
            type="button"
            id="info-btn"
            class="icon-btn"
            aria-label="システム・API情報"
            title="システム・API情報"
          >
            <InfoIcon />
          </button>
          <a class="header-link" href="/">
            ← ダッシュボード
          </a>
        </header>

        <main class="by-repo">
          {state.repos.length === 0 ? (
            <div class="empty">完了したタスクはありません</div>
          ) : (
            state.repos.map((g) => (
              <LaneComponent
                key={g.repo}
                id={`done-${g.repo}`}
                title={`${g.repo} (${g.cards.length})`}
                cards={g.cards}
                open
              />
            ))
          )}
        </main>

        <InfoModalDialog />
        <HistoryModalDialog />

        <script>
          {raw(
            `window.__AUTOPILOT_DONE_CARDS__ = ${JSON.stringify(state.repos.flatMap((g) => g.cards))};\nwindow.__AUTOPILOT_HEALTH__ = ${JSON.stringify(health)};`,
          )}
        </script>
        <script type="module" src="/client.js"></script>
      </body>
    </html>
  );
};
