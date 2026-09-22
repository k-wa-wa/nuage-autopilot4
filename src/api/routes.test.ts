import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createMockDb } from "../view/dev/mock.ts";
import { mountApiRoutes } from "./routes.ts";
import type { buildDoneState, buildState } from "./state.ts";

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

  test("mountApiRoutes: /api/chat/conversations および /:id が会話一覧と詳細を返す", async () => {
    const { db } = createMockDb("standard");
    const app = new Hono();
    mountApiRoutes(app, db);

    // 1. 初期の会話一覧（0件）
    const resEmpty = await app.request("/api/chat/conversations?repo=k-wa-wa/test-repo&issue=1");
    expect(resEmpty.status).toBe(200);
    const jsonEmpty = (await resEmpty.json()) as { conversations: unknown[] };
    expect(jsonEmpty.conversations).toBeArray();

    // 2. /api/chat を叩いて会話を作成
    process.env.MOCK_CHAT = "true";
    await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        card: {
          repo: "k-wa-wa/test-repo",
          issue_number: 1,
          title: "Test",
          display_hint: "精緻化中",
        },
        message: "テストメッセージです",
      }),
    });

    // 3. 会話一覧の取得（1件存在すること）
    const resList = await app.request("/api/chat/conversations?repo=k-wa-wa/test-repo&issue=1");
    expect(resList.status).toBe(200);
    const jsonList = (await resList.json()) as {
      conversations: Array<{ id: string; title: string }>;
    };
    expect(jsonList.conversations.length).toBe(1);
    const convId = jsonList.conversations[0]!.id;

    // 4. 会話詳細とメッセージ履歴の取得
    const resDetail = await app.request(`/api/chat/conversations/${convId}`);
    expect(resDetail.status).toBe(200);
    const jsonDetail = (await resDetail.json()) as {
      conversation: { id: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(jsonDetail.conversation.id).toBe(convId);
    expect(jsonDetail.messages.length).toBeGreaterThanOrEqual(1);
    expect(jsonDetail.messages[0]?.content).toBe("テストメッセージです");

    // 5. 存在しないIDへの 404
    const resNotFound = await app.request("/api/chat/conversations/non-existent-id");
    expect(resNotFound.status).toBe(404);
  });
});
