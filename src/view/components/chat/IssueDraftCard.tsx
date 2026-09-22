import { useState } from "preact/hooks";
import { ExternalLinkIcon } from "../icons.tsx";
import { renderBlocks } from "./markdownBlocks.tsx";

export interface IssueDraft {
  repo: string;
  title: string;
  body: string;
}

export function parseIssueDraft(content: string): IssueDraft {
  const title = content.match(/\*\*タイトル\*\*:\s*([^\n]+)/)?.[1]?.trim() ?? "";
  const repo = content.match(/\*\*対象リポジトリ\*\*:\s*([^\n]+)/)?.[1]?.trim() ?? "";
  const body = content
    .replace(/\*\*タイトル\*\*:\s*[^\n]+\n?/, "")
    .replace(/\*\*対象リポジトリ\*\*:\s*[^\n]+\n?/, "")
    .trim();
  return { repo, title, body };
}

type CreateState =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "created"; url: string; issueNumber: number | undefined }
  | { status: "failed"; message: string };

async function createIssue(draft: IssueDraft): Promise<{ url: string; issue_number?: number }> {
  const res = await fetch("/api/issue/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    url?: string;
    issue_number?: number;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.url) throw new Error(data.error || `HTTP ${res.status}`);
  return { url: data.url, issue_number: data.issue_number };
}

export function IssueDraftCard({ draft }: { draft: IssueDraft }) {
  const [state, setState] = useState<CreateState>({ status: "idle" });
  const canCreate = Boolean(draft.repo && draft.title);

  const onCreate = async () => {
    setState({ status: "creating" });
    try {
      const created = await createIssue(draft);
      setState({ status: "created", url: created.url, issueNumber: created.issue_number });
    } catch (err) {
      setState({ status: "failed", message: String(err) });
    }
  };

  return (
    <div class="issue-draft-card">
      <div class="issue-draft-header">
        <span class="issue-draft-badge">📋 GitHub Issue ドラフト</span>
      </div>
      <div class="issue-draft-title">{draft.title}</div>
      <div class="issue-draft-repo">
        対象: <code>{draft.repo}</code>
      </div>
      <div class="issue-draft-content">{renderBlocks(draft.body)}</div>
      <div class="issue-create-action">
        {state.status === "created" ? (
          <a
            href={state.url}
            target="_blank"
            rel="noopener noreferrer"
            class="issue-created-badge"
            title="GitHub で開く"
          >
            <span>✅ Issue #{state.issueNumber ?? "?"} を起票しました</span>
            <ExternalLinkIcon />
          </a>
        ) : (
          <button
            type="button"
            class="issue-create-btn"
            disabled={!canCreate || state.status === "creating"}
            onClick={() => void onCreate()}
          >
            {state.status === "creating" ? "起票中..." : "🚀 GitHub Issue を起票"}
          </button>
        )}
      </div>
      {state.status === "failed" && (
        <div class="issue-create-error">起票エラー: {state.message}</div>
      )}
    </div>
  );
}
