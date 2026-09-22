import type { FC } from "hono/jsx";
import type { Card } from "../state.ts";
import { formatAgo, isErrorHint } from "../utils.ts";
import { HistoryIcon, PrIcon, WarnIcon } from "./icons.tsx";

export interface CardProps {
  card: Card;
}

export const CardComponent: FC<CardProps> = ({ card: c }) => {
  const cardKey = `${c.repo}#${c.issue_number}`;
  const hasError = isErrorHint(c.display_hint);
  // Done は display_hint を持たない（types.ts hintMatchesState）。state_since は Done になった時刻。
  const isDone = c.display_hint === "";
  const issueUrl = c.issue_url || c.url;

  const bits: string[] = [c.repo, `#${c.issue_number}`];
  if (isDone) bits.push(`クローズ: ${formatAgo(c.state_since)}`);
  if (c.queue_position) bits.push(`待ち順位 #${c.queue_position}`);
  if (c.job_type) bits.push(`ジョブ: ${c.job_type}`);
  if (c.started_at) bits.push(`開始: ${formatAgo(c.started_at)}`);

  const historyCount = c.job_history?.length ?? 0;

  // エラープレビューの生成
  let summaryPreview = "";
  if (hasError && c.error_detail) {
    const firstLine = c.error_detail.summary.split("\n")[0] || "エラー詳細";
    summaryPreview = firstLine.length > 35 ? `${firstLine.slice(0, 35)}…` : firstLine;
  }

  const parentKey = c.parent_issue_number
    ? `${c.parent_repo || c.repo}#${c.parent_issue_number}`
    : undefined;
  const isParent = Boolean(c.sub_issues_total && c.sub_issues_total > 0);

  return (
    <div
      class={`card${hasError ? " has-error" : ""}${isDone ? " done" : ""}`}
      data-key={cardKey}
      data-parent-key={parentKey}
      data-is-parent={isParent ? "true" : undefined}
    >
      {historyCount > 0 && (
        <button
          type="button"
          class="card-history-btn card-history-trigger"
          data-key={cardKey}
          title={`ジョブ実行履歴を表示 (${historyCount}回実行)`}
        >
          <HistoryIcon />
          <span>{historyCount}</span>
        </button>
      )}

      <a class="card-main" href={issueUrl} target="_blank" rel="noreferrer" title="Issue を開く">
        <div class="t">{c.title || "(no title)"}</div>
        <div class="s">
          {!isDone && <span class="hint">{c.display_hint}</span>}
          <span>{bits.join(" · ")}</span>
        </div>
      </a>

      {hasError && c.error_detail && (
        <div class="card-sub">
          <span class="sub-connector">└</span>
          <button
            type="button"
            class="error-badge card-error-trigger"
            data-key={cardKey}
            title={`クリックしてエラー詳細を表示: ${c.error_detail.summary}`}
          >
            <WarnIcon />
            <span>エラー: {summaryPreview}</span>
          </button>
        </div>
      )}

      {c.pr_url && (
        <div class="card-sub">
          <span class="sub-connector">└</span>
          <a class="pr-badge" href={c.pr_url} target="_blank" rel="noreferrer" title="PR を開く">
            <PrIcon />
            <span>#{c.pr_number}</span>
          </a>
        </div>
      )}

      {c.parent_issue_number && (
        <div class="card-sub">
          <span class="sub-connector">└</span>
          <span class="relation-badge parent-badge" title={`親 Issue #${c.parent_issue_number}`}>
            親: #{c.parent_issue_number}
          </span>
        </div>
      )}

      {c.sub_issue_numbers && c.sub_issue_numbers.length > 0 && (
        <div class="card-sub">
          <span class="sub-connector">└</span>
          <span class="relation-badge-group">
            {c.sub_issue_numbers.map((n) => (
              <span
                key={n}
                class="relation-badge child-badge"
                data-child-key={`${c.repo}#${n}`}
                title={`子 Issue #${n}`}
              >
                子: #{n}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
};
