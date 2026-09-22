import type { Card, JobHistoryItem } from "../../api/state.ts";
import { formatAgo, formatDuration } from "../utils.ts";
import { Modal } from "./Modal.tsx";

const RESULT_MODIFIERS: Record<string, string> = {
  success: " success",
  fail: " fail",
  timeout: " fail",
  blocked: " blocked",
  running: " running",
};

export function HistoryTimeline({ history }: { history: JobHistoryItem[] }) {
  if (!history.length) {
    return <div class="timeline-empty">実行履歴がありません</div>;
  }

  return (
    <div class="timeline">
      {history.map((item) => {
        const result = item.result || "UNKNOWN";
        const modifier = RESULT_MODIFIERS[result.toLowerCase()] ?? "";
        return (
          <div class="timeline-item" key={item.id}>
            <div class={`timeline-marker${modifier}`} />
            <div class="timeline-header">
              <div class="timeline-title-group">
                <span class="timeline-job-type">ジョブ: {item.job_type}</span>
                <span class={`timeline-result${modifier}`}>{result}</span>
              </div>
              <div class="timeline-time-group">
                <span>
                  所要時間:{" "}
                  <strong class="timeline-duration">{formatDuration(item.duration_sec)}</strong>
                </span>
                <span class="timeline-time">{formatAgo(item.started_at)}</span>
              </div>
            </div>

            {(item.summary || item.next_context) && (
              <div class="timeline-body">
                {item.summary && <div class="timeline-summary">{item.summary}</div>}
                {item.next_context && (
                  <div class="timeline-next-context">
                    <strong>次のコンテキスト:</strong> {item.next_context}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function HistoryModal(props: { card: Card | null; onClose: () => void }) {
  const c = props.card;
  return (
    <Modal
      open={c !== null}
      onClose={props.onClose}
      title={c ? `⏱️ ジョブ実行履歴 (${c.repo}#${c.issue_number})` : "⏱️ ジョブ実行履歴"}
      boxClass="history-modal-box"
    >
      {c && <HistoryModalBody card={c} />}
    </Modal>
  );
}

function HistoryModalBody({ card: c }: { card: Card }) {
  const history = c.job_history ?? [];
  return (
    <>
      <div class="modal-section">
        <div class="error-meta-box">
          <div class="error-issue-title">{c.title || "(no title)"}</div>
          <div class="error-badges-row">
            {c.display_hint && <span class="tag-badge">{c.display_hint}</span>}
            <span class="tag-badge">
              {c.repo}#{c.issue_number}
            </span>
            {c.pr_number > 0 && <span class="tag-badge">PR #{c.pr_number}</span>}
            <span class="tag-badge">計 {history.length} 回実行</span>
          </div>
        </div>
      </div>
      <div class="modal-section history-timeline-section">
        <HistoryTimeline history={history} />
      </div>
      <div class="modal-footer">
        <a href={c.issue_url || c.url} target="_blank" rel="noreferrer" class="btn btn-secondary">
          Issue を開く
        </a>
        {c.pr_url && (
          <a href={c.pr_url} target="_blank" rel="noreferrer" class="btn btn-secondary">
            PR を開く
          </a>
        )}
      </div>
    </>
  );
}
