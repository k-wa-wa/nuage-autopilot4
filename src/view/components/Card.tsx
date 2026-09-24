import { useContext } from "preact/hooks";
import type { Card } from "../../api/state.ts";
import { cardKeyOf, formatAgo, isErrorHint, parentKeyOf } from "../utils.ts";
import { Badge } from "./Badge.tsx";
import { CardActionsContext } from "./cardActions.ts";
import { HistoryIcon, PrIcon, SparklesIcon, WarnIcon } from "./icons.tsx";

export function CardView({ card: c }: { card: Card }) {
  const actions = useContext(CardActionsContext);
  const cardKey = cardKeyOf(c);
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

  let summaryPreview = "";
  if (hasError && c.error_detail) {
    const firstLine = c.error_detail.summary.split("\n")[0] || "エラー詳細";
    summaryPreview = firstLine.length > 35 ? `${firstLine.slice(0, 35)}…` : firstLine;
  }

  const isParent = Boolean(c.sub_issues_total && c.sub_issues_total > 0);
  const { openChat, openError, openHistory, hover, registerElement, relationOf } = actions;
  const relation = relationOf?.(cardKey);
  const classes = ["card"];
  if (hasError) classes.push("has-error");
  if (isDone) classes.push("done");
  if (relation) classes.push(`relation-${relation}`);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ホバーは親子コネクタ線の見た目だけに使う
    <div
      class={classes.join(" ")}
      data-key={cardKey}
      data-parent-key={parentKeyOf(c) ?? undefined}
      data-is-parent={isParent ? "true" : undefined}
      ref={registerElement ? (el) => registerElement(cardKey, el) : undefined}
      onMouseEnter={hover ? () => hover(cardKey) : undefined}
      onMouseLeave={hover ? () => hover(null) : undefined}
    >
      <div class="card-actions">
        {openChat && (
          <button
            type="button"
            class="card-action-btn card-debug-btn"
            title="Autopilot Chat で調査"
            aria-label="Autopilot Chat で調査"
            onClick={() => openChat(c)}
          >
            <SparklesIcon size={12} />
          </button>
        )}
        {openHistory && historyCount > 0 && (
          <button
            type="button"
            class="card-action-btn card-history-btn"
            title={`ジョブ実行履歴を表示 (${historyCount}回実行)`}
            onClick={() => openHistory(c)}
          >
            <HistoryIcon />
            <span>{historyCount}</span>
          </button>
        )}
      </div>

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
          <Badge
            variant="warn"
            class="error-badge"
            icon={<WarnIcon />}
            title={`クリックしてエラー詳細を表示: ${c.error_detail.summary}`}
            onClick={() => openError?.(c)}
          >
            エラー: {summaryPreview}
          </Badge>
        </div>
      )}

      {c.pr_url && (
        <div class="card-sub">
          <span class="sub-connector">└</span>
          <Badge
            variant="accent"
            class="pr-badge"
            icon={<PrIcon />}
            href={c.pr_url}
            target="_blank"
            rel="noreferrer"
            title="PR を開く"
          >
            #{c.pr_number}
          </Badge>
        </div>
      )}

      {c.parent_issue_number && (
        <div class="card-sub">
          <span class="sub-connector">└</span>
          <Badge
            variant="muted"
            class="relation-badge parent-badge"
            title={`親 Issue #${c.parent_issue_number}`}
          >
            親: #{c.parent_issue_number}
          </Badge>
        </div>
      )}

      {c.sub_issue_numbers && c.sub_issue_numbers.length > 0 && (
        <div class="card-sub">
          <span class="sub-connector">└</span>
          <span class="relation-badge-group">
            {c.sub_issue_numbers.map((n) => (
              <Badge
                key={n}
                variant="muted"
                class="relation-badge child-badge"
                title={`子 Issue #${n}`}
              >
                子: #{n}
              </Badge>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
