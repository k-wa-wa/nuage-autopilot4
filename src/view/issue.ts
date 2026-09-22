import type { Context } from "hono";

export interface CreateIssuePayload {
  repo: string;
  title: string;
  body: string;
}

/**
 * Hono ハンドラ: POST /api/issue/create
 *
 * チャット（壁打ちモード）でまとまった仕様をもとに GitHub Issue を起票する。
 * 起票された Issue は Autopilot の Poller / Triage が自動検知し、自律開発キューに乗る。
 */
export async function handleCreateIssue(c: Context) {
  let payload: CreateIssuePayload;
  try {
    payload = await c.req.json<CreateIssuePayload>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { repo, title, body } = payload;
  if (!repo || !title) {
    return c.json({ error: "repo and title are required" }, 400);
  }

  // 1. モック環境（dev.tsx / MOCK_CHAT=true）の場合
  if (process.env.MOCK_CHAT === "true") {
    const mockIssueNumber = Math.floor(Math.random() * 900) + 100;
    return c.json({
      ok: true,
      issue_number: mockIssueNumber,
      url: `https://github.com/${repo}/issues/${mockIssueNumber}`,
      title,
    });
  }

  // 2. 本番環境: gh issue create を呼び出す
  try {
    const proc = Bun.spawn(
      ["gh", "issue", "create", "-R", repo, "--title", title, "--body", body || ""],
      {
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
        },
      },
    );

    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (code !== 0) {
      return c.json({ error: `Issue 起票に失敗しました: ${stderr}` }, 500);
    }

    const issueUrl = stdout.trim();
    const match = issueUrl.match(/\/issues\/(\d+)$/);
    const numStr = match?.[1];
    const issueNumber = numStr ? Number.parseInt(numStr, 10) : undefined;

    return c.json({
      ok: true,
      issue_number: issueNumber,
      url: issueUrl,
      title,
    });
  } catch (err) {
    return c.json({ error: `Issue 起票プロセス実行エラー: ${String(err)}` }, 500);
  }
}
