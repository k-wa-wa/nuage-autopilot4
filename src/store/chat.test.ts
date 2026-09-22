import { describe, expect, test } from "bun:test";
import {
  addChatMessage,
  getConversation,
  getLatestConversation,
  listChatMessages,
  listConversations,
  upsertConversation,
} from "./chat.ts";
import { openDb } from "./db.ts";

describe("Chat Store (chat_conversations & chat_messages)", () => {
  test("会話の作成、更新、取得、メッセージの追加が正常に動作する", async () => {
    const db = openDb(":memory:");

    // 1. 新規会話作成
    const conv1 = upsertConversation(db, {
      id: "conv-101",
      repo: "k-wa-wa/nuage-autopilot4",
      issueNumber: 42,
      mode: "investigate",
      engine: "claude",
      title: "エラー原因の調査",
    });

    expect(conv1.id).toBe("conv-101");
    expect(conv1.repo).toBe("k-wa-wa/nuage-autopilot4");
    expect(conv1.issue_number).toBe(42);
    expect(conv1.mode).toBe("investigate");
    expect(conv1.engine).toBe("claude");
    expect(conv1.title).toBe("エラー原因の調査");

    // 2. メッセージの追加
    const msg1 = addChatMessage(db, {
      conversationId: "conv-101",
      role: "user",
      content: "何が起きていますか？",
    });
    expect(msg1.id).toBeGreaterThan(0);
    expect(msg1.conversation_id).toBe("conv-101");
    expect(msg1.role).toBe("user");
    expect(msg1.content).toBe("何が起きていますか？");

    const msg2 = addChatMessage(db, {
      conversationId: "conv-101",
      role: "assistant",
      content: "ジョブのタイムアウトが原因です。",
    });
    expect(msg2.id).toBeGreaterThan(msg1.id);
    expect(msg2.role).toBe("assistant");

    // 3. メッセージ一覧取得（昇順）
    const messages = listChatMessages(db, "conv-101");
    expect(messages.length).toBe(2);
    expect(messages[0]?.content).toBe("何が起きていますか？");
    expect(messages[1]?.content).toBe("ジョブのタイムアウトが原因です。");

    // 4. 最新会話の取得
    const latest = getLatestConversation(db, "k-wa-wa/nuage-autopilot4", 42);
    expect(latest?.id).toBe("conv-101");

    await Bun.sleep(10);

    // 5. 別の会話を作成（最新の更新順を検証）
    const conv2 = upsertConversation(db, {
      id: "conv-102",
      repo: "k-wa-wa/nuage-autopilot4",
      issueNumber: 42,
      mode: "brainstorm",
      engine: "agy",
      title: "新機能の壁打ち",
    });
    expect(conv2.id).toBe("conv-102");
    expect(getLatestConversation(db, "k-wa-wa/nuage-autopilot4", 42)?.id).toBe("conv-102");

    await Bun.sleep(10);

    // conv1 にメッセージを追加すると conv1 が最新になる
    addChatMessage(db, {
      conversationId: "conv-101",
      role: "user",
      content: "対処法を教えてください",
    });
    expect(getLatestConversation(db, "k-wa-wa/nuage-autopilot4", 42)?.id).toBe("conv-101");

    // 6. 会話一覧取得
    const list = listConversations(db, "k-wa-wa/nuage-autopilot4", 42);
    expect(list.length).toBe(2);
    expect(list[0]?.id).toBe("conv-101");
    expect(list[1]?.id).toBe("conv-102");

    // 7. CASCADE 削除の確認
    db.query("DELETE FROM chat_conversations WHERE id = ?").run("conv-101");
    expect(getConversation(db, "conv-101")).toBeNull();
    expect(listChatMessages(db, "conv-101").length).toBe(0);
  });
});
