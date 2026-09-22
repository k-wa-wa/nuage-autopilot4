import { describe, expect, it } from "bun:test";
import { createDevApp } from "./dev.tsx";

describe("AI Debug Chat API (/api/chat)", () => {
  it("POST /api/chat にリクエストすると SSE ストリーム (init, thought, text, done) が返る", async () => {
    process.env.MOCK_CHAT = "true";
    const { app } = createDevApp("errors");

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
      if (accumulated.includes("event: text") || accumulated.includes("event: done")) {
        break;
      }
    }
    reader.cancel();

    expect(accumulated).toContain("event: init");
    expect(accumulated).toContain("101");
  });
});
