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
    return m < 1 ? "たった今" : m < 60 ? `${m}分前` : m < 1440 ? `${Math.floor(m / 60)}時間前` : `${Math.floor(m / 1440)}日前`;
  };

  const formatReset = (iso: string | null): string => {
    if (!iso) return "--";
    const resetMs = Date.parse(iso);
    if (isNaN(resetMs)) return "--";
    const d = new Date(resetMs);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const diffMin = Math.round((resetMs - Date.now()) / 60000);
    if (diffMin <= 0) return `${hh}:${mm} (まもなく/リセット済)`;
    if (diffMin < 60) return `${hh}:${mm} (あと${diffMin}分)`;
    const diffHours = Math.floor(diffMin / 60);
    const remMin = diffMin % 60;
    return `${hh}:${mm} (あと${diffHours}時間${remMin}分)`;
  };

  const formatPollTime = (iso: string | null): string => {
    if (!iso) return "未実行";
    const d = new Date(iso);
    const timeStr = isNaN(d.getTime()) ? "" : ` (${d.toLocaleTimeString()})`;
    return `${ago(iso)}${timeStr}`;
  };

  const esc = (s: unknown): string =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));

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
        const bits = [`${c.repo}#${c.issue_number}`];
        if (c.queue_position) bits.push(`${c.queue_position}番目`);
        if (c.job_type) bits.push(`${c.job_type} ${ago(c.started_at)}`);
        else bits.push(ago(c.state_since));

        const issueUrl = c.issue_url || `https://github.com/${c.repo}/issues/${c.issue_number}`;
        const prUrl = c.pr_url || (c.pr_number > 0 ? `https://github.com/${c.repo}/pull/${c.pr_number}` : null);

        let subHtml = "";
        if (c.pr_number > 0 && prUrl) {
          subHtml =
            `<div class="card-sub">` +
            `<span class="sub-connector">↳</span>` +
            `<a class="pr-badge" href="${prUrl}" target="_blank" rel="noreferrer" title="関連 Pull Request を開く">` +
            `${prIcon}<span>PR #${c.pr_number}</span>` +
            `</a>` +
            `</div>`;
        }

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
    const gqlPct = Math.max(0, Math.min(100, Math.round((gqlRem / gqlLimit) * 100)));
    const gqlVal = document.getElementById("graphql-rate-val");
    if (gqlVal) gqlVal.textContent = `${gqlRem.toLocaleString()} / ${gqlLimit.toLocaleString()}`;
    const gqlBar = document.getElementById("graphql-progress-bar");
    if (gqlBar) {
      gqlBar.style.width = `${gqlPct}%`;
      gqlBar.classList.toggle("warn", gqlPct < 20);
    }
    const gqlReset = document.getElementById("graphql-reset-val");
    if (gqlReset) gqlReset.textContent = formatReset(health.graphql_reset_at);

    const restRem = health.rest_remaining ?? 0;
    const restLimit = health.rest_limit || 5000;
    const restPct = Math.max(0, Math.min(100, Math.round((restRem / restLimit) * 100)));
    const restVal = document.getElementById("rest-rate-val");
    if (restVal) restVal.textContent = `${restRem.toLocaleString()} / ${restLimit.toLocaleString()}`;
    const restBar = document.getElementById("rest-progress-bar");
    if (restBar) {
      restBar.style.width = `${restPct}%`;
      restBar.classList.toggle("warn", restPct < 20);
    }
    const restReset = document.getElementById("rest-reset-val");
    if (restReset) restReset.textContent = formatReset(health.rest_reset_at);

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
