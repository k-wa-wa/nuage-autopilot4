import type { Health } from "../../api/state.ts";
import type { AgentUsage } from "../../execute/adapters/index.ts";
import { formatPollTime, formatReset } from "../utils.ts";
import { Modal } from "./Modal.tsx";

function RateCard(props: {
  name: string;
  value: string;
  usedPct?: number;
  resetLabel?: string;
  valueWarn?: boolean;
}) {
  const { name, value, usedPct, resetLabel, valueWarn } = props;
  return (
    <div class="rate-card">
      <div class="rate-header">
        <div class="rate-name">{name}</div>
        <div class={valueWarn ? "rate-val rate-val-warn" : "rate-val"}>{value}</div>
      </div>
      {usedPct !== undefined && (
        <div class="progress-bar-bg">
          <div
            class={usedPct >= 80 ? "progress-bar-fill warn" : "progress-bar-fill"}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      )}
      {resetLabel !== undefined && (
        <div class="rate-footer">
          <span>リセット</span>
          <span class="rate-reset">{resetLabel}</span>
        </div>
      )}
    </div>
  );
}

function GithubRateCard(props: {
  name: string;
  remaining: number;
  limit: number;
  resetAt: string | null;
}) {
  const limit = props.limit || 5000;
  const used = Math.max(0, limit - (props.remaining ?? 0));
  const usedPct = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
  return (
    <RateCard
      name={props.name}
      value={`${used.toLocaleString()} / ${limit.toLocaleString()}`}
      usedPct={usedPct}
      resetLabel={formatReset(props.resetAt)}
    />
  );
}

function adapterTitle(u: AgentUsage): string {
  if (u.adapter === "claude") return "Claude Code";
  if (u.adapter === "agy") return "Antigravity";
  return u.command;
}

function agentUsageCards(usages: AgentUsage[]) {
  return usages.flatMap((u) => {
    const title = adapterTitle(u);
    if (u.error) {
      return [<RateCard key={`${title}-error`} name={title} value={u.error} valueWarn />];
    }
    return u.limits.map((lim) => (
      <RateCard
        key={`${title}-${lim.label}`}
        name={`${title} · ${lim.label}`}
        value={`残り ${lim.remainingPct}%`}
        usedPct={Math.max(0, Math.min(100, 100 - lim.remainingPct))}
        resetLabel={formatReset(lim.resetAt)}
      />
    ));
  });
}

export function InfoModal(props: { open: boolean; onClose: () => void; health: Health }) {
  const { health } = props;
  const agentCards = agentUsageCards(health.agent_usages ?? []);
  return (
    <Modal open={props.open} onClose={props.onClose} title="システム・API情報">
      <div class="modal-section">
        <h3>GitHub API キャパシティ</h3>
        <div class="rate-limit-cards">
          <GithubRateCard
            name="GraphQL API"
            remaining={health.graphql_remaining}
            limit={health.graphql_limit}
            resetAt={health.graphql_reset_at}
          />
          <GithubRateCard
            name="REST API (GitHub)"
            remaining={health.rest_remaining}
            limit={health.rest_limit}
            resetAt={health.rest_reset_at}
          />
        </div>
      </div>
      <div class="modal-section">
        <h3>LLM / エージェント キャパシティ</h3>
        <div class="rate-limit-cards">
          {agentCards.length ? agentCards : <div class="empty">使用量情報なし</div>}
        </div>
      </div>
      <div class="modal-section">
        <h3>システム状態</h3>
        <dl class="status-grid">
          <div>
            <dt>バージョン</dt>
            <dd>{health.version || "--"}</dd>
          </div>
          <div>
            <dt>実行中ジョブ</dt>
            <dd>{health.running_jobs} 件</dd>
          </div>
          <div>
            <dt>最終同期</dt>
            <dd>{formatPollTime(health.last_poll_at)}</dd>
          </div>
          <div class="status-full">
            <dt>システム状態</dt>
            <dd>{health.degraded.length ? health.degraded.join(" / ") : "正常稼働中"}</dd>
          </div>
        </dl>
      </div>
    </Modal>
  );
}
