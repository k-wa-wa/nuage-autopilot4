import type { FC } from "hono/jsx";

export const InfoModalDialog: FC = () => {
  return (
    <dialog id="info-modal" class="modal">
      <div class="modal-box">
        <div class="modal-header">
          <h2>システム・API情報</h2>
          <button type="button" id="modal-close-btn" class="close-btn" aria-label="閉じる">
            &times;
          </button>
        </div>
        <div class="modal-body">
          <div class="modal-section">
            <h3>GitHub API キャパシティ</h3>
            <div class="rate-limit-cards">
              <div class="rate-card">
                <div class="rate-header">
                  <div class="rate-name">GraphQL API</div>
                  <div class="rate-val" id="graphql-rate-val">
                    -- / --
                  </div>
                </div>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" id="graphql-progress-bar" style="width: 0%" />
                </div>
                <div class="rate-footer">
                  <span>リセット</span>
                  <span class="rate-reset" id="graphql-reset-val">
                    --
                  </span>
                </div>
              </div>
              <div class="rate-card">
                <div class="rate-header">
                  <div class="rate-name">REST API (GitHub)</div>
                  <div class="rate-val" id="rest-rate-val">
                    -- / --
                  </div>
                </div>
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" id="rest-progress-bar" style="width: 0%" />
                </div>
                <div class="rate-footer">
                  <span>リセット</span>
                  <span class="rate-reset" id="rest-reset-val">
                    --
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-section" id="agent-usage-section">
            <h3>LLM / エージェント キャパシティ</h3>
            <div class="rate-limit-cards" id="agent-rate-cards">
              <div class="empty">使用量情報を取得中...</div>
            </div>
          </div>
          <div class="modal-section">
            <h3>システム状態</h3>
            <dl class="status-grid">
              <div>
                <dt>バージョン</dt>
                <dd id="modal-version">--</dd>
              </div>
              <div>
                <dt>実行中ジョブ</dt>
                <dd id="modal-running-jobs">--</dd>
              </div>
              <div>
                <dt>最終同期</dt>
                <dd id="modal-last-poll">--</dd>
              </div>
              <div class="status-full">
                <dt>システム状態</dt>
                <dd id="modal-degraded-status">正常稼働中</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </dialog>
  );
};
