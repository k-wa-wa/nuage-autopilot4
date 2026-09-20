import type { FC } from "hono/jsx";
import type { CardErrorItem } from "../state.ts";
import { formatAgo } from "../utils.ts";

export interface ErrorHistoryListProps {
  history?: CardErrorItem[];
}

export const ErrorHistoryListComponent: FC<ErrorHistoryListProps> = ({ history = [] }) => {
  return (
    <>
      {history.map((h, i) => (
        <div class="error-history-item" key={i}>
          <div class="error-history-header">
            <span>
              {h.job_type ? `ジョブ: ${h.job_type}` : "処理"} ({h.result || "FAIL"})
            </span>
            <span>{formatAgo(h.occurred_at)}</span>
          </div>
          <div class="error-history-reason">{h.summary}</div>
        </div>
      ))}
    </>
  );
};

export const ErrorModalDialog: FC = () => {
  return (
    <dialog id="error-modal" class="modal">
      <div class="modal-box error-modal-box">
        <div class="modal-header">
          <h2 id="error-modal-title">⚠️ エラー原因</h2>
          <button type="button" id="error-modal-close-btn" class="close-btn" aria-label="閉じる">
            &times;
          </button>
        </div>
        <div class="modal-body">
          <div class="modal-section">
            <div class="error-meta-box">
              <div class="error-issue-title" id="error-modal-issue-title">
                --
              </div>
              <div class="error-badges-row" id="error-modal-badges" />
            </div>
            <div class="error-detail-box" id="error-modal-reason">
              --
            </div>
          </div>
          <div class="modal-section" id="error-history-section" style="display: none;">
            <h3>
              過去のエラー履歴 (<span id="error-history-count">0</span>件)
            </h3>
            <div id="error-modal-history" class="error-history-list" />
          </div>
          <div class="modal-footer">
            <a
              id="error-modal-issue-link"
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              class="btn btn-secondary"
            >
              GitHub で開く
            </a>
            <button type="button" id="error-modal-dismiss-btn" class="btn btn-primary">
              閉じる
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
};
