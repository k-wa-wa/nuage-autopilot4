import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { handleChatStream } from "./chat.ts";

describe("AI Debug Chat API (/api/chat)", () => {
  const app = new Hono();
  app.post("/api/chat", handleChatStream);

  it("POST /api/chat にリクエストすると SSE ストリーム (init, thought, text, done) が返る", async () => {
    process.env.MOCK_CHAT = "true";

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
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.body).not.toBeNull();

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    // 最初のチャンク群を取得（init, thought, tool_start等）
    for (let i = 0; i < 15; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value);
      if (accumulated.includes("event: done") || accumulated.includes("event: text")) {
        break;
      }
    }

    expect(accumulated).toContain("event: init");
  });
});
