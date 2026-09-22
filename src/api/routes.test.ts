import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createMockDb } from "../view/dev/mock.ts";
import { mountApiRoutes } from "./routes.ts";
import { type buildDoneState, buildState } from "./state.ts";

describe("Autopilot HTTP API Routes Regression Tests (/api/*)", () => {
  test("mountApiRoutes: /api/state が StateResponse を正しく返す", async () => {
    const { db } = createMockDb("standard");
    const app = new Hono();
    mountApiRoutes(app, db);

    const res = await app.request("/api/state");
    expect(res.status).toBe(200);
    const json = (await res.json()) as ReturnType<typeof buildState>;
    expect(json.lanes).toBeDefined();
    expect(json.lanes.action_required).toBeArray();
    expect(json.lanes.working).toBeArray();
    expect(json.lanes.queued).toBeArray();
    expect(json.lanes.backlog).toBeArray();
    expect(json.health).toBeDefined();
    expect(json.health.version).toBeDefined();
  });

  test("mountApiRoutes: /api/health が Health を正しく返す", async () => {
    const { db } = createMockDb("alerts");
    const app = new Hono();
    mountApiRoutes(app, db);

    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const json = (await res.json()) as ReturnType<typeof buildState>["health"];
    expect(json.degraded.length).toBeGreaterThan(0);
    expect(json.graphql_limit).toBe(5000);
  });

  test("mountApiRoutes: /api/done が DoneResponse を正しく返す", async () => {
    const { db } = createMockDb("standard");
    const app = new Hono();
    mountApiRoutes(app, db);

    const res = await app.request("/api/done");
    expect(res.status).toBe(200);
    const json = (await res.json()) as ReturnType<typeof buildDoneState>;
    expect(json.repos).toBeArray();
  });

  test("mountApiRoutes: /api/render/lanes が HTML 片と state を返す", async () => {
    const { db } = createMockDb("standard");
    const app = new Hono();
    mountApiRoutes(app, db);

    const res = await app.request("/api/render/lanes");
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      action_required: string;
      working: string;
      queued: string;
      backlog: string;
      banner: string;
      state: ReturnType<typeof buildState>;
    };
    expect(json.action_required).toContain("card");
    expect(json.working).toContain("card");
    expect(json.state).toBeDefined();
    expect(json.state.lanes).toBeDefined();
  });

  test("mountApiRoutes: /api/render/history の正常系とバリデーション", async () => {
    const { db } = createMockDb("standard");
    const app = new Hono();
    mountApiRoutes(app, db);

    const resBad = await app.request("/api/render/history");
    expect(resBad.status).toBe(400);

    const state = buildState(db);
    const firstCard = state.lanes.action_required[0];
    if (firstCard) {
      const res = await app.request(
        `/api/render/history?repo=${encodeURIComponent(firstCard.repo)}&issue=${firstCard.issue_number}`,
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { timeline_html: string };
      expect(json.timeline_html).toBeDefined();
    }
  });

  test("mountApiRoutes: /api/render/error の正常系とバリデーション", async () => {
    const { db } = createMockDb("errors");
    const app = new Hono();
    mountApiRoutes(app, db);

    const resBad = await app.request("/api/render/error");
    expect(resBad.status).toBe(400);

    const state = buildState(db);
    const errCard = state.lanes.action_required.find((c) => c.error_detail);
    if (errCard) {
      const res = await app.request(
        `/api/render/error?repo=${encodeURIComponent(errCard.repo)}&issue=${errCard.issue_number}`,
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { error_history_html: string };
      expect(json.error_history_html).toBeDefined();
    }
  });

  test("mountApiRoutes: /api/issue/create が正常に応答する", async () => {
    const { db } = createMockDb("standard");
    const app = new Hono();
    mountApiRoutes(app, db);

    process.env.MOCK_CHAT = "true";
    const res = await app.request("/api/issue/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo: "k-wa-wa/test-repo",
        title: "Test Issue",
        body: "Test Body",
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; issue_number: number };
    expect(json.ok).toBe(true);
    expect(json.issue_number).toBeGreaterThan(0);
  });

  test("mountApiRoutes: /api/chat が SSE ストリーミングで応答する", async () => {
    const { db } = createMockDb("standard");
    const app = new Hono();
    mountApiRoutes(app, db);

    process.env.MOCK_CHAT = "true";
    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hello" }],
        repo: "k-wa-wa/test-repo",
        mode: "survey",
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body).toContain("data:");
  });
});
