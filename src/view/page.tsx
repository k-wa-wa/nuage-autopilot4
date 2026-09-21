import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { initClient } from "./client.ts";
import { BannerComponent } from "./components/Banner.tsx";
import { ErrorModalDialog } from "./components/ErrorModal.tsx";
import { HistoryModalDialog } from "./components/HistoryModal.tsx";
import { InfoModalDialog } from "./components/InfoModal.tsx";
import { InfoIcon } from "./components/icons.tsx";
import { LaneComponent } from "./components/Lane.tsx";
import { SystemErrorModalDialog } from "./components/SystemErrorModal.tsx";
import type { StateResponse } from "./state.ts";
import { styles } from "./styles.ts";

/**
 * Dashboard UI（spec.md §10）。
 *
 * Hono JSX を用いた型安全なコンポーネント構成。
 * サーバーサイドレンダリング（SSR）による初期表示と、
 * ポーリングによる HTML 片の更新に対応。
 */

export interface PageProps {
  initialState?: StateResponse;
}

export const Page: FC<PageProps> = ({ initialState }) => {
  const metaText = initialState ? `実行中 ${initialState.health.running_jobs}` : "";

  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Autopilot</title>
        <style>{raw(styles)}</style>
      </head>
      <body>
        <header>
          <h1>Autopilot</h1>
          <span class="meta" id="meta">
            {metaText}
          </span>
          <button
            type="button"
            id="info-btn"
            class="icon-btn"
            aria-label="システム・API情報"
            title="システム・API情報"
          >
            <InfoIcon />
          </button>
        </header>

        <div id="banner">
          <BannerComponent degraded={initialState?.health.degraded} />
        </div>

        <main>
          <LaneComponent
            id="action_required"
            title="🧑 Action Required"
            cards={initialState?.lanes.action_required}
            open
          />
          <LaneComponent id="working" title="🤖 Working" cards={initialState?.lanes.working} open />
          <LaneComponent id="queued" title="📦 Queued" cards={initialState?.lanes.queued} open />
          <LaneComponent id="backlog" title="📥 Backlog" cards={initialState?.lanes.backlog} />
        </main>

        <svg id="relation-connector-canvas" class="relation-connector-svg" aria-hidden="true">
          <g id="relation-connector-layer" />
        </svg>

        <InfoModalDialog />
        <ErrorModalDialog />
        <SystemErrorModalDialog />
        <HistoryModalDialog />

        <script>
          {raw(
            `window.__AUTOPILOT_INITIAL_STATE__ = ${JSON.stringify(initialState || null)};\n(${initClient.toString()})();`,
          )}
        </script>
      </body>
    </html>
  );
};
