import type { Card, StateResponse } from "./state.ts";

/**
 * ブラウザ側で実行されるダッシュボードのクライアントロジック。
 *
 * page.tsx から関数文字列として埋め込まれるため、
 * 関数の外部スコープに依存せず、内部で完結させる。
 */
export function initClient(): void {
  const ago = (t: string | null): string => {
    if (!t) return "";
    const m = Math.floor((Date.now() - Date.parse(t)) / 60000);
    return m < 1
      ? "たった今"
      : m < 60
        ? `${m}分前`
        : m < 1440
          ? `${Math.floor(m / 60)}時間前`
          : `${Math.floor(m / 1440)}日前`;
  };

  const formatReset = (iso: string | null): string => {
    if (!iso) return "--";
    const resetMs = Date.parse(iso);
    if (Number.isNaN(resetMs)) return iso;
    const diffMin = Math.round((resetMs - Date.now()) / 60000);
    if (diffMin <= 0) return "まもなくリセット";
    if (diffMin < 60) return `あと${diffMin}分`;
    if (diffMin < 1440) {
      const hours = Math.floor(diffMin / 60);
      const mins = diffMin % 60;
      return mins === 0 ? `あと${hours}時間` : `あと${hours}時間${mins}分`;
    }
    const days = Math.floor(diffMin / 1440);
    const remHours = Math.floor((diffMin % 1440) / 60);
    return remHours === 0 ? `あと${days}日` : `あと${days}日${remHours}時間`;
  };

  const formatPollTime = (iso: string | null): string => {
    if (!iso) return "未実行";
    const d = new Date(iso);
    const timeStr = Number.isNaN(d.getTime()) ? "" : ` (${d.toLocaleTimeString()})`;
    return `${ago(iso)}${timeStr}`;
  };

  const esc = (s: unknown): string =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c,
    );

  function render(lane: string, cards: Card[]): void {
    const el = document.getElementById(lane);
    if (!el) return;
    if (!cards.length) {
      el.innerHTML = '<div class="empty">なし</div>';
      return;
    }
    const prIcon =
      '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"></path></svg>';
    el.innerHTML = cards
      .map((c) => {
        const bits = [c.repo, `#${c.issue_number}`];
        if (c.queue_position) bits.push(`待ち順位 #${c.queue_position}`);
        if (c.job_type) bits.push(`ジョブ: ${c.job_type}`);
        if (c.started_at) bits.push(`開始: ${ago(c.started_at)}`);
        const issueUrl = c.issue_url || c.url;
        const prHtml = c.pr_url
          ? `<a class="pr-badge" href="${c.pr_url}" target="_blank" rel="noreferrer" title="PR を開く">${prIcon}<span>#${c.pr_number}</span></a>`
          : "";
        const subHtml = prHtml
          ? `<div class="card-sub"><span class="sub-connector">└</span>${prHtml}</div>`
          : "";

        return (
          `<div class="card">` +
          `<a class="card-main" href="${issueUrl}" target="_blank" rel="noreferrer" title="Issue を開く">` +
          `<div class="t">${esc(c.title || "(no title)")}</div>` +
          `<div class="s"><span class="hint">${esc(c.display_hint)}</span><span>${bits.map(esc).join(" · ")}</span></div>` +
          `</a>` +
          subHtml +
          `</div>`
        );
      })
      .join("");
  }

  function updateModal(health: StateResponse["health"]): void {
    const gqlRem = health.graphql_remaining ?? 0;
    const gqlLimit = health.graphql_limit || 5000;
    const gqlUsed = Math.max(0, gqlLimit - gqlRem);
    const gqlUsedPct = Math.max(0, Math.min(100, Math.round((gqlUsed / gqlLimit) * 100)));
    const gqlVal = document.getElementById("graphql-rate-val");
    if (gqlVal) gqlVal.textContent = `${gqlUsed.toLocaleString()} / ${gqlLimit.toLocaleString()}`;
    const gqlBar = document.getElementById("graphql-progress-bar");
    if (gqlBar) {
      gqlBar.style.width = `${gqlUsedPct}%`;
      gqlBar.classList.toggle("warn", gqlUsedPct >= 80);
    }
    const gqlReset = document.getElementById("graphql-reset-val");
    if (gqlReset) gqlReset.textContent = formatReset(health.graphql_reset_at);

    const restRem = health.rest_remaining ?? 0;
    const restLimit = health.rest_limit || 5000;
    const restUsed = Math.max(0, restLimit - restRem);
    const restUsedPct = Math.max(0, Math.min(100, Math.round((restUsed / restLimit) * 100)));
    const restVal = document.getElementById("rest-rate-val");
    if (restVal)
      restVal.textContent = `${restUsed.toLocaleString()} / ${restLimit.toLocaleString()}`;
    const restBar = document.getElementById("rest-progress-bar");
    if (restBar) {
      restBar.style.width = `${restUsedPct}%`;
      restBar.classList.toggle("warn", restUsedPct >= 80);
    }
    const restReset = document.getElementById("rest-reset-val");
    if (restReset) restReset.textContent = formatReset(health.rest_reset_at);

    const agentContainer = document.getElementById("agent-rate-cards");
    if (agentContainer) {
      if (!health.agent_usages || health.agent_usages.length === 0) {
        agentContainer.innerHTML = '<div class="empty">使用量情報なし</div>';
      } else {
        let html = "";
        for (const u of health.agent_usages) {
          const adapterTitle =
            u.adapter === "claude"
              ? "Claude Code"
              : u.adapter === "agy"
                ? "Antigravity"
                : u.command;
          if (u.error) {
            html +=
              `<div class="rate-card">` +
              `<div class="rate-header">` +
              `<div class="rate-name">${esc(adapterTitle)}</div>` +
              `<div class="rate-val" style="color: var(--warn); font-size: 11px;">${esc(u.error)}</div>` +
              `</div>` +
              `</div>`;
            continue;
          }
          for (const lim of u.limits) {
            const usedPct = Math.max(0, Math.min(100, 100 - lim.remainingPct));
            const isWarn = usedPct >= 80;
            html +=
              `<div class="rate-card">` +
              `<div class="rate-header">` +
              `<div class="rate-name">${esc(adapterTitle)} · ${esc(lim.label)}</div>` +
              `<div class="rate-val">残り ${lim.remainingPct}%</div>` +
              `</div>` +
              `<div class="progress-bar-bg">` +
              `<div class="progress-bar-fill${isWarn ? " warn" : ""}" style="width: ${usedPct}%"></div>` +
              `</div>` +
              `<div class="rate-footer">` +
              `<span>リセット</span>` +
              `<span class="rate-reset">${esc(formatReset(lim.resetAt))}</span>` +
              `</div>` +
              `</div>`;
          }
        }
        agentContainer.innerHTML = html || '<div class="empty">使用量情報なし</div>';
      }
    }

    const jobsEl = document.getElementById("modal-running-jobs");
    if (jobsEl) jobsEl.textContent = `${health.running_jobs} 件`;

    const pollEl = document.getElementById("modal-last-poll");
    if (pollEl) pollEl.textContent = formatPollTime(health.last_poll_at);

    const degradedEl = document.getElementById("modal-degraded-status");
    if (degradedEl) {
      degradedEl.textContent = health.degraded.length ? health.degraded.join(" / ") : "正常稼働中";
    }
  }

  async function refresh(): Promise<void> {
    try {
      const r = await fetch("/api/state");
      const s = (await r.json()) as StateResponse;
      const laneKeys = ["action_required", "working", "queued", "backlog"] as const;
      for (const k of laneKeys) {
        render(k, s.lanes[k] || []);
      }
      const meta = document.getElementById("meta");
      if (meta) {
        meta.textContent = `実行中 ${s.health.running_jobs}`;
      }
      const banner = document.getElementById("banner");
      if (banner) {
        banner.innerHTML = s.health.degraded.length
          ? `<div class="banner">${s.health.degraded.map(esc).join(" / ")}</div>`
          : "";
      }
      updateModal(s.health);
    } catch {
      const banner = document.getElementById("banner");
      if (banner) banner.innerHTML = '<div class="banner">autopilot に接続できません</div>';
    }
  }

  // モーダルダイアログの制御
  const modal = document.getElementById("info-modal") as HTMLDialogElement | null;
  const infoBtn = document.getElementById("info-btn");
  const closeBtn = document.getElementById("modal-close-btn");

  if (infoBtn && modal) {
    infoBtn.addEventListener("click", () => {
      modal.showModal();
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => {
      modal.close();
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.close();
      }
    });
  }

  refresh();
  let t = setInterval(refresh, 4000);
  window.addEventListener("autopilot:refresh", refresh);
  document.addEventListener("visibilitychange", () => {
    clearInterval(t);
    if (!document.hidden) {
      refresh();
      t = setInterval(refresh, 4000);
    }
  });
}
