import type { Card } from "../../api/state.ts";
import { formatAgo } from "../utils.ts";
import { Modal } from "./Modal.tsx";

export function ErrorModal(props: { card: Card | null; onClose: () => void }) {
  const c = props.card;
  return (
    <Modal
      open={c !== null}
      onClose={props.onClose}
      title={c ? `⚠️ エラー原因 (${c.repo}#${c.issue_number})` : "⚠️ エラー原因"}
      boxClass="error-modal-box"
    >
      {c && <ErrorModalBody card={c} onClose={props.onClose} />}
    </Modal>
  );
}

function ErrorModalBody({ card: c, onClose }: { card: Card; onClose: () => void }) {
  const detail = c.error_detail;
  const history = c.error_history ?? [];
  return (
    <>
      <div class="modal-section">
        <div class="error-meta-box">
          <div class="error-issue-title">{c.title || "(no title)"}</div>
          <div class="error-badges-row">
            <span class="tag-badge warn">{c.display_hint}</span>
            <span class="tag-badge">
              {c.repo}#{c.issue_number}
            </span>
            {detail?.job_type && <span class="tag-badge">ジョブ: {detail.job_type}</span>}
            {detail?.result && <span class="tag-badge warn">{detail.result}</span>}
            {detail?.occurred_at && (
              <span class="tag-badge">発生: {formatAgo(detail.occurred_at)}</span>
            )}
          </div>
        </div>
        <div class="error-detail-box">
          {detail?.summary || "エラー理由が記録されていません。詳細はログを確認してください。"}
        </div>
      </div>
      {history.length > 1 && (
        <div class="modal-section">
          <h3>過去のエラー履歴 ({history.length}件)</h3>
          <div class="error-history-list">
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
          </div>
        </div>
      )}
      <div class="modal-footer">
        <a href={c.issue_url || c.url} target="_blank" rel="noreferrer" class="btn btn-secondary">
          GitHub で開く
        </a>
        <button type="button" class="btn btn-primary" onClick={onClose}>
          閉じる
        </button>
      </div>
    </>
  );
}
