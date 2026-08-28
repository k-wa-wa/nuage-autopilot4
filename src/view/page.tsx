import type { FC } from "hono/jsx";
import { raw } from "hono/html";
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
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #191816;
    --fg: #e8e4dc;
    --muted: #98928a;
    --line: #2f2d29;
    --card: #211f1c;
    --warn: #e0a08a;
  }
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
  gap: 12px;
  align-items: baseline;
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
a.card {
  display: block;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 11px 13px;
  margin-bottom: 8px;
  text-decoration: none;
  color: inherit;
}
a.card:hover { border-color: var(--muted); }
.t {
  font-weight: 500;
  margin-bottom: 4px;
  overflow-wrap: anywhere;
}
.s {
  color: var(--muted);
  font-size: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.hint {
  font-weight: 500;
  color: var(--fg);
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
        </header>
        <div id="banner" />
        <main>
          <Lane id="action_required" title="🧑 Action Required" open />
          <Lane id="working" title="🤖 Working" open />
          <Lane id="queued" title="📦 Queued" open />
          <Lane id="backlog" title="📥 Backlog" />
        </main>
        <script>{raw(`(${initClient.toString()})();`)}</script>
      </body>
    </html>
  );
};
