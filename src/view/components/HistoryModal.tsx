import type { FC } from "hono/jsx";
import type { JobHistoryItem } from "../../api/state.ts";
import { formatAgo, formatDuration } from "../utils.ts";

export interface HistoryTimelineProps {
  history?: JobHistoryItem[];
}

export const HistoryTimelineComponent: FC<HistoryTimelineProps> = ({ history = [] }) => {
  if (!history.length) {
    return <div class="timeline-empty">実行履歴がありません</div>;
  }

  return (
    <>
      {history.map((item) => {
        const res = (item.result || "UNKNOWN").toLowerCase();
        let markerModifier = "";
        let resultModifier = "";
        if (res === "success") {
          markerModifier = " success";
          resultModifier = " success";
        } else if (res === "fail" || res === "timeout") {
          markerModifier = " fail";
          resultModifier = " fail";
        } else if (res === "blocked") {
          markerModifier = " blocked";
          resultModifier = " blocked";
        } else if (res === "running") {
          markerModifier = " running";
          resultModifier = " running";
        }

        const durationStr = formatDuration(item.duration_sec);
        const timeStr = formatAgo(item.started_at);

        return (
          <div class="timeline-item" key={item.id}>
            <div class={`timeline-marker${markerModifier}`} />
            <div class="timeline-header">
              <div class="timeline-title-group">
                <span class="timeline-job-type">ジョブ: {item.job_type}</span>
                <span class={`timeline-result${resultModifier}`}>{item.result || "UNKNOWN"}</span>
              </div>
              <div class="timeline-time-group">
                <span>
                  所要時間: <strong class="timeline-duration">{durationStr}</strong>
                </span>
                <span class="timeline-time">{timeStr}</span>
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
    </>
  );
};

export const HistoryModalDialog: FC = () => {
  return (
    <dialog id="history-modal" class="modal">
      <div class="modal-box history-modal-box">
        <div class="modal-header">
          <h2 id="history-modal-title">⏱️ ジョブ実行履歴</h2>
          <button type="button" id="history-modal-close-btn" class="close-btn" aria-label="閉じる">
            &times;
          </button>
        </div>
        <div class="modal-body">
          <div class="modal-section">
            <div class="error-meta-box">
              <div class="error-issue-title" id="history-modal-issue-title">
                --
              </div>
              <div class="error-badges-row" id="history-modal-badges" />
            </div>
          </div>
          <div
            class="modal-section"
            style="max-height: 420px; overflow-y: auto; padding-right: 4px;"
          >
            <div id="history-modal-timeline" class="timeline" />
          </div>
          <div class="modal-footer">
            <a
              id="history-modal-issue-link"
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              class="btn btn-secondary"
            >
              Issue を開く
            </a>
            <a
              id="history-modal-pr-link"
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              class="btn btn-secondary"
              style="display: none;"
            >
              PR を開く
            </a>
          </div>
        </div>
      </div>
    </dialog>
  );
};
