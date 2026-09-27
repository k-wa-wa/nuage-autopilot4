import { describe, expect, test } from "bun:test";
import {
  getConversation,
  getLatestConversation,
  listConversations,
  upsertConversation,
} from "./chat.ts";
import { openDb } from "./db.ts";

describe("Chat Store (chat_conversations)", () => {
  test("会話の作成、更新、session_file_path の永続化、最新会話の取得が正常に動作する", async () => {
    const db = openDb(":memory:");

    // 1. 新規会話作成（session_file_path 付き）
    const conv1 = upsertConversation(db, {
      id: "conv-101",
      mode: "investigate",
      engine: "claude",
      title: "エラー原因の調査",
      sessionFilePath: "/home/user/.claude/projects/test/conv-101.jsonl",
    });

    expect(conv1.id).toBe("conv-101");
    expect(conv1.mode).toBe("investigate");
    expect(conv1.engine).toBe("claude");
    expect(conv1.title).toBe("エラー原因の調査");
    expect(conv1.session_file_path).toBe("/home/user/.claude/projects/test/conv-101.jsonl");

    // 2. 取得の確認
    const fetched = getConversation(db, "conv-101");
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe("conv-101");
    expect(fetched?.session_file_path).toBe("/home/user/.claude/projects/test/conv-101.jsonl");

    // 3. 最新会話の取得（引数なしで全体から最新を取得）
    const latest = getLatestConversation(db);
    expect(latest?.id).toBe("conv-101");

    await Bun.sleep(10);

    // 4. 別の会話を作成（最新の更新順を検証）
    const conv2 = upsertConversation(db, {
      id: "conv-102",
      mode: "brainstorm",
      engine: "claude",
      title: "新機能の壁打ち",
    });
    expect(conv2.id).toBe("conv-102");
    expect(conv2.session_file_path).toBe("");
    expect(getLatestConversation(db)?.id).toBe("conv-102");

    await Bun.sleep(10);

    // 5. conv1 を更新して最新にする
    upsertConversation(db, {
      id: "conv-101",
      mode: "investigate",
      engine: "claude",
      title: "エラー原因の調査（更新）",
    });
    const latestAfterUpdate = getLatestConversation(db);
    expect(latestAfterUpdate?.id).toBe("conv-101");
    expect(latestAfterUpdate?.title).toBe("エラー原因の調査（更新）");
    // session_file_path が上書きされず保持されていること
    expect(latestAfterUpdate?.session_file_path).toBe(
      "/home/user/.claude/projects/test/conv-101.jsonl",
    );

    // 6. 会話一覧取得（全体から平等に取得）
    const list = listConversations(db);
    expect(list.length).toBe(2);
    expect(list[0]?.id).toBe("conv-101");
    expect(list[1]?.id).toBe("conv-102");

    // 7. 削除の確認
    db.query("DELETE FROM chat_conversations WHERE id = ?").run("conv-101");
    expect(getConversation(db, "conv-101")).toBeNull();

    // 8. マイグレーション0003によって chat_messages テーブルが存在しないことを確認
    const tableCheck = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'")
      .get();
    expect(tableCheck).toBeNull();

    // 9. マイグレーション0004によって repo, issue_number カラムが chat_conversations に存在しないことを確認
    const tableInfo = db.query("PRAGMA table_info(chat_conversations)").all() as Array<{
      name: string;
    }>;
    const columnNames = tableInfo.map((col) => col.name);
    expect(columnNames).not.toContain("repo");
    expect(columnNames).not.toContain("issue_number");
  });
});
