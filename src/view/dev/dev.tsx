import { networkInterfaces } from "node:os";
import { Hono } from "hono";
import qrcodeTerminal from "qrcode-terminal";
import { buildDoneState, buildState } from "../../api/state.ts";
import { renderDocument } from "../document.tsx";
import type { DevOptions } from "../pageData.ts";
import { mountRoutes } from "../server.tsx";
import { createMockDb, loadScenario, SCENARIOS, type ScenarioName } from "./mock.ts";

/** LAN からスマホ等でアクセスするための IPv4 アドレス（見つからなければ null）。 */
function getLanIp(): string | null {
  for (const iface of Object.values(networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return null;
}

const devBarStyles = `
.dev-toolbar {
  background: var(--card);
  color: var(--fg);
  border-bottom: 1px solid var(--line);
  padding: 8px 20px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  font: 12px ui-sans-serif, -apple-system, sans-serif;
}
.dev-toolbar .control-group {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--muted);
  font-weight: 500;
}
.dev-toolbar select {
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
  outline: none;
  max-width: 100%;
}
.dev-toolbar select:hover {
  border-color: var(--muted);
}
`;

export function createDevApp(initialScenario: ScenarioName = "standard") {
  process.env.MOCK_CHAT = "true";
  const { db, currentScenario: activeScenario } = createMockDb(initialScenario);
  let currentScenario = activeScenario;

  const app = new Hono();

  mountRoutes(app, db);

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

  const dev = (): DevOptions => ({
    scenarios: SCENARIOS.map((sc) => ({ name: sc.name, title: sc.title })),
    current: currentScenario,
  });

  app.get("/", (c) => {
    const q = c.req.query("scenario") as ScenarioName | undefined;
    if (q && SCENARIOS.some((s) => s.name === q) && q !== currentScenario) {
      loadScenario(db, q);
      currentScenario = q;
    }
    return c.html(
      renderDocument(
        { page: "dashboard", state: buildState(db), dev: dev() },
        { extraStyles: devBarStyles },
      ),
    );
  });

  // 完了ページにもシナリオ切替のツールバーを付ける
  app.get("/done", (c) =>
    c.html(
      renderDocument(
        {
          page: "done",
          done: buildDoneState(db),
          health: buildState(db).health,
          dev: dev(),
        },
        { extraStyles: devBarStyles },
      ),
    ),
  );

  return { app, db, getScenario: () => currentScenario };
}

export function startDevServer(
  options: { port?: number; hostname?: string; scenario?: ScenarioName } = {},
) {
  const port = options.port ?? Number(process.env.PORT || 4000);
  // LAN 上の他端末（スマホ等）からもアクセスできるよう既定で全インターフェースを待ち受ける。
  // 認証機構はないため、信頼できないネットワークでは HOST=127.0.0.1 を指定すること。
  const hostname = options.hostname ?? (process.env.HOST || "0.0.0.0");
  const scenario = options.scenario ?? "standard";

  const { app, getScenario } = createDevApp(scenario);

  const server = Bun.serve({
    port,
    hostname,
    fetch: app.fetch,
  });

  const lanIp = getLanIp();
  const lanUrl = lanIp ? `http://${lanIp}:${port}` : null;

  console.log(`
┌────────────────────────────────────────────────────────────┐
│  Autopilot Dashboard (Local Dev Server)                    │
│                                                            │
│  • URL:           http://localhost:${port}                    │
${lanUrl ? `│  • LAN URL:       ${lanUrl}${" ".repeat(Math.max(0, 41 - lanUrl.length))}│\n` : ""}│  • Scenario:      ${getScenario()}                             │
│                                                            │
│  Available Scenarios (?scenario=<name>):                   │
${SCENARIOS.map((s) => `│    - ${s.name.padEnd(10)}: ${s.title}`).join("\n")}
│                                                            │
│  (Press Ctrl+C to stop)                                    │
└────────────────────────────────────────────────────────────┘
`);

  if (lanUrl) {
    console.log("スマホでスキャンしてアクセス:");
    qrcodeTerminal.generate(lanUrl, { small: true }, (qr) => console.log(qr));
  }

  return {
    server,
    stop: () => server.stop(true),
  };
}

export function runFromCli(): void {
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

if (import.meta.main) {
  runFromCli();
}
