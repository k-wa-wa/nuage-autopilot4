import type { Health } from "../../api/state.ts";
import { formatAgo } from "../utils.ts";
import { Modal } from "./Modal.tsx";

export function SystemErrorModal(props: { open: boolean; onClose: () => void; health: Health }) {
  const { health } = props;
  const failedJobs = health.failed_jobs ?? [];
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="⚠️ システム障害・滞留ジョブ詳細"
      boxClass="error-modal-box"
    >
      <div class="modal-section">
        <h3>障害ステータス</h3>
        <div class="error-detail-box system-degraded-list">
          {health.degraded.length
            ? health.degraded.join("\n")
            : "現在検出されているシステム障害はありません。"}
        </div>
      </div>
      {failedJobs.length > 0 && (
        <div class="modal-section">
          <h3>直近の失敗ジョブ一覧（1時間以内）</h3>
          <div class="failed-jobs-list">
            {failedJobs.map((j) => (
              <div class="failed-job-card" key={j.id}>
                <div class="failed-job-header">
                  <span>
                    {j.repo}#{j.issue_number} ({j.job_type})
                  </span>
                  <span>{formatAgo(j.completed_at)}</span>
                </div>
                <div class="failed-job-reason">{j.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div class="modal-footer">
        <button type="button" class="btn btn-primary" onClick={props.onClose}>
          閉じる
        </button>
      </div>
    </Modal>
  );
}
