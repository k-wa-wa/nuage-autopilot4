import { describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { listConversations, upsertConversation } from "../store/chat.ts";
import { openDb } from "../store/db.ts";
import { createChatStreamHandler, createGetConversationHandler } from "./chat.ts";

describe("AI Debug Chat API (/api/chat)", () => {
  it("POST /api/chat にリクエストすると SSE ストリームが返り、会話セッションが DB に保存される", async () => {
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
        engine: "claude",
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
  });

  it("GET /api/chat/conversations/:id は Claude セッション JSONL からメッセージ履歴を復元する", async () => {
    const db = openDb(":memory:");
    const app = new Hono();
    app.get("/api/chat/conversations/:id", createGetConversationHandler(db));

    // テスト用の一時 JSONL ファイルを作成
    const tmpFile = join(tmpdir(), `test-api-conv-${Date.now()}.jsonl`);
    const jsonlContent = [
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "【指示・質問】\nエラーログを確認して" },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "ログを確認中" },
            { type: "tool_use", id: "t1", name: "Bash", input: { command: "kubectl logs" } },
            { type: "text", text: "接続エラーが発生しています。" },
          ],
        },
      }),
    ].join("\n");
    writeFileSync(tmpFile, jsonlContent, "utf8");

    // DB に session_file_path 付きで会話を登録
    upsertConversation(db, {
      id: "test-conv-1",
      repo: "k-wa-wa/nuage-cluster",
      issueNumber: 101,
      mode: "investigate",
      engine: "claude",
      title: "エラーログを確認して",
      sessionFilePath: tmpFile,
    });

    const res = await app.request("/api/chat/conversations/test-conv-1");
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      conversation: { id: string; title: string };
      messages: Array<{
        role: string;
        content: string;
        thinking?: string;
        tools?: Array<{ name: string; detail: string }>;
      }>;
    };

    expect(data.conversation.id).toBe("test-conv-1");
    expect(data.messages.length).toBe(2);

    expect(data.messages[0]?.role).toBe("user");
    expect(data.messages[0]?.content).toBe("エラーログを確認して");

    expect(data.messages[1]?.role).toBe("assistant");
    expect(data.messages[1]?.content).toBe("接続エラーが発生しています。");
    expect(data.messages[1]?.thinking).toBe("ログを確認中");
    expect(data.messages[1]?.tools?.length).toBe(1);
    expect(data.messages[1]?.tools?.[0]?.name).toBe("Bash");
    expect(data.messages[1]?.tools?.[0]?.detail).toBe("kubectl logs");
  });

  it("モックの壁打ちモードで『起票して』と発言した場合、セッション JSONL に起票完了とツール実行が保存され復元できる", async () => {
    process.env.MOCK_CHAT = "true";
    const db = openDb(":memory:");
    const app = new Hono();
    app.post("/api/chat", createChatStreamHandler(db));
    app.get("/api/chat/conversations/:id", createGetConversationHandler(db));

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        card: {
          repo: "k-wa-wa/nuage-autopilot4",
          issue_number: 50,
          title: "新機能の検討",
          display_hint: "仕様確認待ち",
        },
        message: "この内容で起票して",
        mode: "brainstorm",
        engine: "claude",
      }),
    });

    expect(res.status).toBe(200);
    const bodyText = await res.text();
    expect(bodyText).toContain("event: done");

    const convs = listConversations(db, "k-wa-wa/nuage-autopilot4", 50);
    expect(convs.length).toBe(1);
    const convId = convs[0]!.id;

    // GET /api/chat/conversations/:id で復元
    const getRes = await app.request(`/api/chat/conversations/${convId}`);
    expect(getRes.status).toBe(200);
    const data = (await getRes.json()) as {
      messages: Array<{
        role: string;
        content: string;
        thinking?: string;
        tools?: Array<{ name: string; detail: string }>;
      }>;
    };

    expect(data.messages.length).toBe(2);
    expect(data.messages[0]?.role).toBe("user");
    expect(data.messages[0]?.content).toBe("この内容で起票して");

    expect(data.messages[1]?.role).toBe("assistant");
    expect(data.messages[1]?.content).toContain("✅ Issue を起票しました");
    expect(data.messages[1]?.tools?.length).toBeGreaterThanOrEqual(1);
    expect(data.messages[1]?.tools?.[0]?.detail).toContain("gh issue create");
  });
});
