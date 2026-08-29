import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { initClient } from "./client.ts";

/**
 * Dashboard UI（spec.md §10）。
 *
 * Hono JSX を用いた型安全なコンポーネント定義。
 * SPA 資産はバイナリに内蔵するため単一の TSX で完結させる。
 */

interface LaneProps {
  id: string;
  title: string;
  open?: boolean;
}

const Lane: FC<LaneProps> = ({ id, title, open = false }) => (
  <section>
    <details open={open}>
      <summary>{title}</summary>
      <div id={id} />
    </details>
  </section>
);

const styles = `
:root {
  --bg: #fbfbfa;
  --fg: #26241f;
  --muted: #7a756c;
  --line: #e6e3dd;
  --card: #fff;
  --warn: #a8442a;
  --accent: #3b82f6;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #191816;
    --fg: #e8e4dc;
    --muted: #98928a;
    --line: #2f2d29;
    --card: #211f1c;
    --warn: #e0a08a;
    --accent: #60a5fa;
  }
}
:root[data-theme="dark"] {
  --bg: #191816;
  --fg: #e8e4dc;
  --muted: #98928a;
  --line: #2f2d29;
  --card: #211f1c;
  --warn: #e0a08a;
  --accent: #60a5fa;
}
:root[data-theme="light"] {
  --bg: #fbfbfa;
  --fg: #26241f;
  --muted: #7a756c;
  --line: #e6e3dd;
  --card: #fff;
  --warn: #a8442a;
  --accent: #3b82f6;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 14px/1.6 ui-sans-serif, -apple-system, "Hiragino Sans", sans-serif;
}
header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 10px;
  align-items: center;
}
h1 {
  font-size: 15px;
  margin: 0;
  font-weight: 600;
  letter-spacing: .02em;
}
.meta {
  color: var(--muted);
  font-size: 12px;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  line-height: 1;
  transition: color 0.15s ease;
}
.icon-btn:hover {
  color: var(--fg);
}
.banner {
  background: var(--warn);
  color: #fff;
  padding: 8px 20px;
  font-size: 13px;
}
main {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  padding: 20px;
  align-items: start;
}
section { min-width: 0; }
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
  transition: border-color 0.15s ease;
}
.card:hover { border-color: var(--muted); }
.card-main {
  display: block;
  padding: 11px 13px;
  text-decoration: none;
  color: inherit;
}
.card-main:hover .t {
  color: var(--accent);
}
.t {
  font-weight: 500;
  margin-bottom: 4px;
  overflow-wrap: anywhere;
  transition: color 0.15s ease;
}
.s {
  color: var(--muted);
  font-size: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.hint {
  font-weight: 500;
  color: var(--fg);
}
.card-sub {
  border-top: 1px dashed var(--line);
  padding: 6px 13px;
  background: rgba(120, 120, 120, 0.04);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.sub-connector {
  color: var(--muted);
  font-family: monospace;
  font-size: 12px;
  user-select: none;
}
.pr-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  text-decoration: none;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.08);
  transition: background 0.15s ease, color 0.15s ease;
}
.pr-badge:hover {
  background: rgba(59, 130, 246, 0.18);
  text-decoration: underline;
}
.pr-badge svg {
  flex-shrink: 0;
}
.empty {
  color: var(--muted);
  font-size: 13px;
  padding: 6px 0;
}
details summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .08em;
  font-weight: 600;
  margin-bottom: 10px;
  user-select: none;
}
details summary:hover { color: var(--fg); }

/* Modal Dialog */
dialog.modal {
  border: none;
  padding: 0;
  background: transparent;
  max-width: 100vw;
  max-height: 100vh;
}
dialog.modal::backdrop {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}
.modal-box {
  background: var(--card);
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 20px 24px;
  width: 440px;
  max-width: calc(100vw - 32px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}
.modal-header h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}
.close-btn {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: var(--muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.close-btn:hover {
  color: var(--fg);
  background: var(--bg);
}
.modal-section {
  margin-bottom: 18px;
}
.modal-section:last-child {
  margin-bottom: 0;
}
.modal-section h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--muted);
  margin: 0 0 10px 0;
  font-weight: 600;
}
.rate-limit-cards {
  display: grid;
  gap: 10px;
}
.rate-card {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
}
.rate-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.rate-name {
  font-weight: 600;
  font-size: 13px;
}
.rate-val {
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--fg);
}
.progress-bar-bg {
  background: var(--line);
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}
.progress-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  transition: width 0.3s ease, background 0.3s ease;
}
.progress-bar-fill.warn {
  background: var(--warn);
}
.rate-footer {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
}
.rate-reset {
  color: var(--fg);
  font-weight: 500;
}
.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin: 0;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
}
.status-grid dt {
  color: var(--muted);
  font-size: 11px;
  margin-bottom: 2px;
}
.status-grid dd {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
}
.status-full {
  grid-column: 1 / -1;
  border-top: 1px solid var(--line);
  padding-top: 6px;
  margin-top: 2px;
}
`;

export const Page: FC = () => {
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
          <span class="meta" id="meta" />
          <button
            id="info-btn"
            class="icon-btn"
            aria-label="システム・API情報"
            title="システム・API情報"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </header>
        <div id="banner" />
        <main>
          <Lane id="action_required" title="🧑 Action Required" open />
          <Lane id="working" title="🤖 Working" open />
          <Lane id="queued" title="📦 Queued" open />
          <Lane id="backlog" title="📥 Backlog" />
        </main>

        <dialog id="info-modal" class="modal">
          <div class="modal-box">
            <div class="modal-header">
              <h2>システム・API情報</h2>
              <button id="modal-close-btn" class="close-btn" aria-label="閉じる">
                &times;
              </button>
            </div>
            <div class="modal-body">
              <div class="modal-section">
                <h3>GitHub API キャパシティ</h3>
                <div class="rate-limit-cards">
                  <div class="rate-card">
                    <div class="rate-header">
                      <div class="rate-name">GraphQL API</div>
                      <div class="rate-val" id="graphql-rate-val">
                        -- / --
                      </div>
                    </div>
                    <div class="progress-bar-bg">
                      <div
                        class="progress-bar-fill"
                        id="graphql-progress-bar"
                        style="width: 100%"
                      ></div>
                    </div>
                    <div class="rate-footer">
                      <span>リセット時刻</span>
                      <span class="rate-reset" id="graphql-reset-val">
                        --
                      </span>
                    </div>
                  </div>

                  <div class="rate-card">
                    <div class="rate-header">
                      <div class="rate-name">REST API (GitHub)</div>
                      <div class="rate-val" id="rest-rate-val">
                        -- / --
                      </div>
                    </div>
                    <div class="progress-bar-bg">
                      <div
                        class="progress-bar-fill"
                        id="rest-progress-bar"
                        style="width: 100%"
                      ></div>
                    </div>
                    <div class="rate-footer">
                      <span>リセット時刻</span>
                      <span class="rate-reset" id="rest-reset-val">
                        --
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="modal-section">
                <h3>システム状態</h3>
                <dl class="status-grid">
                  <div>
                    <dt>実行中ジョブ</dt>
                    <dd id="modal-running-jobs">--</dd>
                  </div>
                  <div>
                    <dt>最終同期</dt>
                    <dd id="modal-last-poll">--</dd>
                  </div>
                  <div class="status-full">
                    <dt>システム状態</dt>
                    <dd id="modal-degraded-status">正常稼働中</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </dialog>

        <script>{raw(`(${initClient.toString()})();`)}</script>
      </body>
    </html>
  );
};
