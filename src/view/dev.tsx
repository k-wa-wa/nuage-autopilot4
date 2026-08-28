import { Hono } from "hono";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { createMockDb, loadScenario, SCENARIOS, type ScenarioName } from "./mock.ts";
import { buildState } from "./state.ts";
import { Page } from "./page.tsx";

const devBarStyles = `
#dev-toolbar {
  background: var(--card);
  color: var(--fg);
  border-bottom: 1px solid var(--line);
  padding: 8px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  font: 12px ui-sans-serif, -apple-system, sans-serif;
}
#dev-toolbar .control-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
#dev-toolbar label {
  color: var(--muted);
  font-weight: 500;
}
#dev-toolbar select {
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
  outline: none;
}
#dev-toolbar select:hover {
  border-color: var(--muted);
}
`;

const devClientScript = `
(function() {
  const scenarioSelect = document.getElementById("dev-scenario-select");
  const themeSelect = document.getElementById("dev-theme-select");

  async function switchScenario(name) {
    try {
      const res = await fetch('/api/dev/scenario/' + encodeURIComponent(name), { method: 'POST' });
      if (!res.ok) return;
      const url = new URL(window.location);
      url.searchParams.set('scenario', name);
      window.history.replaceState({}, '', url);
      window.dispatchEvent(new CustomEvent('autopilot:refresh'));
    } catch (e) {
      console.error('failed to switch scenario:', e);
    }
  }

  function switchTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
    localStorage.setItem('autopilot_dev_theme', theme);
  }

  if (scenarioSelect) {
    scenarioSelect.addEventListener('change', (e) => {
      switchScenario(e.target.value);
    });
  }

  if (themeSelect) {
    const savedTheme = localStorage.getItem('autopilot_dev_theme') || 'system';
    themeSelect.value = savedTheme;
    switchTheme(savedTheme);

    themeSelect.addEventListener('change', (e) => {
      switchTheme(e.target.value);
    });
  }

  // クエリパラメータの初期同期
  const params = new URLSearchParams(window.location.search);
  const qScenario = params.get('scenario');
  if (qScenario && scenarioSelect && scenarioSelect.value !== qScenario) {
    scenarioSelect.value = qScenario;
  }
})();
`;

interface DevWrapperProps {
  currentScenario: ScenarioName;
}

const DevWrapper: FC<DevWrapperProps> = ({ currentScenario }) => {
  return (
    <>
      <div id="dev-toolbar">
        <div class="control-group">
          <label for="dev-scenario-select">Scenario:</label>
          <select id="dev-scenario-select">
            {SCENARIOS.map((s) => (
              <option value={s.name} selected={s.name === currentScenario}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <div class="control-group">
          <label for="dev-theme-select">Theme:</label>
          <select id="dev-theme-select">
            <option value="system">🌓 System (OS追従)</option>
            <option value="light">☀️ Light</option>
            <option value="dark">🌙 Dark</option>
          </select>
        </div>
      </div>
      <style>{raw(devBarStyles)}</style>
      <Page />
      <script>{raw(devClientScript)}</script>
    </>
  );
};

export function createDevApp(initialScenario: ScenarioName = "standard") {
  const { db, currentScenario: activeScenario } = createMockDb(initialScenario);
  let currentScenario = activeScenario;

  const app = new Hono();

  app.get("/api/state", (c) => c.json(buildState(db)));
  app.get("/api/health", (c) => c.json(buildState(db).health));

  app.get("/api/dev/scenarios", (c) => {
    return c.json({
      current: currentScenario,
      scenarios: SCENARIOS,
    });
  });

  app.post("/api/dev/scenario/:name", (c) => {
    const name = c.req.param("name") as ScenarioName;
    const info = SCENARIOS.find((s) => s.name === name);
    if (!info) {
      return c.json({ error: `Unknown scenario: ${name}` }, 400);
    }
    loadScenario(db, name);
    currentScenario = name;
    return c.json({
      ok: true,
      scenario: info,
      state: buildState(db),
    });
  });

  app.get("/", (c) => {
    const q = c.req.query("scenario") as ScenarioName | undefined;
    if (q && SCENARIOS.some((s) => s.name === q) && q !== currentScenario) {
      loadScenario(db, q);
      currentScenario = q;
    }
    return c.html("<!doctype html>" + <DevWrapper currentScenario={currentScenario} />);
  });

  return { app, db, getScenario: () => currentScenario };
}

export function startDevServer(options: { port?: number; hostname?: string; scenario?: ScenarioName } = {}) {
  const port = options.port ?? Number(process.env.PORT || 4000);
  const hostname = options.hostname ?? (process.env.HOST || "127.0.0.1");
  const scenario = options.scenario ?? "standard";

  const { app, getScenario } = createDevApp(scenario);

  const server = Bun.serve({
    port,
    hostname,
    fetch: app.fetch,
  });

  console.log(`
┌────────────────────────────────────────────────────────────┐
│  Autopilot Dashboard (Local Dev Server)                    │
│                                                            │
│  • URL:           http://${hostname}:${port}                  │
│  • Scenario:      ${getScenario()}                             │
│                                                            │
│  Available Scenarios (?scenario=<name>):                   │
${SCENARIOS.map((s) => `│    - ${s.name.padEnd(10)}: ${s.title}`).join("\n")}
│                                                            │
│  (Press Ctrl+C to stop)                                    │
└────────────────────────────────────────────────────────────┘
`);

  return {
    server,
    stop: () => server.stop(true),
  };
}

// スクリプトとして直接実行された場合にサーバーを起動
if (import.meta.main) {
  const args = process.argv.slice(2);
  let port: number | undefined;
  let scenario: ScenarioName | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-p" || a === "--port") {
      port = Number(args[++i]);
    } else if (a.startsWith("--port=")) {
      port = Number(a.slice("--port=".length));
    } else if (a === "-s" || a === "--scenario") {
      scenario = args[++i] as ScenarioName;
    } else if (a.startsWith("--scenario=")) {
      scenario = a.slice("--scenario=".length) as ScenarioName;
    }
  }

  startDevServer({ port, scenario });
}
