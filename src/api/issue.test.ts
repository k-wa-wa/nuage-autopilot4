import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { handleCreateIssue } from "./issue.ts";

describe("GitHub Issue Create API (/api/issue/create)", () => {
  const app = new Hono();
  app.post("/api/issue/create", handleCreateIssue);

  it("正常系: モック環境で Issue 起票リクエストを送ると issue_number と url が返る", async () => {
    process.env.MOCK_CHAT = "true";
    const res = await app.request("/api/issue/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo: "k-wa-wa/nuage-cluster",
        title: "feat: 新規テスト機能の実装",
        body: "### 背景\nテスト用の Issue 起票\n",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      issue_number: number;
      url: string;
      title: string;
    };
    expect(data.ok).toBe(true);
    expect(data.issue_number).toBeGreaterThan(0);
    expect(data.url).toContain("k-wa-wa/nuage-cluster/issues/");
    expect(data.title).toBe("feat: 新規テスト機能の実装");
  });

  it("異常系: repo または title が不足している場合は 400 エラーを返す", async () => {
    process.env.MOCK_CHAT = "true";
    const res1 = await app.request("/api/issue/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "タイトルのみ" }),
    });
    expect(res1.status).toBe(400);

    const res2 = await app.request("/api/issue/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "k-wa-wa/nuage-cluster" }),
    });
    expect(res2.status).toBe(400);

    const res3 = await app.request("/api/issue/create", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    expect(res3.status).toBe(400);
  });
});
