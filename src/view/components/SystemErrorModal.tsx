import type { FC } from "hono/jsx";

export const SystemErrorModalDialog: FC = () => {
  return (
    <dialog id="system-error-modal" class="modal">
      <div class="modal-box error-modal-box">
        <div class="modal-header">
          <h2>⚠️ システム障害・滞留ジョブ詳細</h2>
          <button
            type="button"
            id="system-error-modal-close-btn"
            class="close-btn"
            aria-label="閉じる"
          >
            &times;
          </button>
        </div>
        <div class="modal-body">
          <div class="modal-section" id="system-degraded-section">
            <h3>障害ステータス</h3>
            <div id="system-degraded-list" class="error-detail-box" style="margin-bottom: 14px;">
              --
            </div>
          </div>
          <div class="modal-section" id="system-failed-jobs-section" style="display: none;">
            <h3>直近の失敗ジョブ一覧（1時間以内）</h3>
            <div class="failed-jobs-list" id="system-failed-jobs-list" />
          </div>
          <div class="modal-footer">
            <button type="button" id="system-error-modal-dismiss-btn" class="btn btn-primary">
              閉じる
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
};
