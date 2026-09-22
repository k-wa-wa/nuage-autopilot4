import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { listChatMessages, listConversations } from "../store/chat.ts";
import { openDb } from "../store/db.ts";
import { createChatStreamHandler } from "./chat.ts";

describe("AI Debug Chat API (/api/chat)", () => {
  it("POST /api/chat にリクエストすると SSE ストリームが返り、会話とメッセージが DB に保存される", async () => {
    process.env.MOCK_CHAT = "true";
    const db = openDb(":memory:");
    const app = new Hono();
    app.post("/api/chat", createChatStreamHandler(db));

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        card: {
          repo: "k-wa-wa/nuage-cluster",
          issue_number: 101,
          title: "テスト用 Issue",
          display_hint: "リトライ上限 (5/5)",
          state_lane: "action_required",
          error_detail: {
            summary: "Command exited with code 1",
            detail: "Error: Connection refused",
          },
        },
        message: "なぜ止まっていますか？",
        mode: "investigate",
        engine: "agy",
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.body).not.toBeNull();

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value);
      if (accumulated.includes("event: done")) {
        break;
      }
    }

    expect(accumulated).toContain("event: init");
    expect(accumulated).toContain("event: done");

    // DB に会話セッションが作成されていること
    const convs = listConversations(db, "k-wa-wa/nuage-cluster", 101);
    expect(convs.length).toBe(1);
    const conv = convs[0]!;
    expect(conv.repo).toBe("k-wa-wa/nuage-cluster");
    expect(conv.issue_number).toBe(101);
    expect(conv.mode).toBe("investigate");

    // DB にメッセージ（ユーザー発言とアシスタント応答）が保存されていること
    const messages = listChatMessages(db, conv.id);
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("なぜ止まっていますか？");
    expect(messages[1]?.role).toBe("assistant");
  });
});
