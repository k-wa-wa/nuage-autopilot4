import type { Card, Health } from "../../api/state.ts";
import { ago, esc, formatPollTime, formatReset } from "./utils.ts";

export function updateInfoModal(health: Health): void {
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
  if (restVal) restVal.textContent = `${restUsed.toLocaleString()} / ${restLimit.toLocaleString()}`;
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
          u.adapter === "claude" ? "Claude Code" : u.adapter === "agy" ? "Antigravity" : u.command;
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

  const versionEl = document.getElementById("modal-version");
  if (versionEl && health.version) versionEl.textContent = health.version;

  const jobsEl = document.getElementById("modal-running-jobs");
  if (jobsEl) jobsEl.textContent = `${health.running_jobs} 件`;

  const pollEl = document.getElementById("modal-last-poll");
  if (pollEl) pollEl.textContent = formatPollTime(health.last_poll_at);

  const degradedEl = document.getElementById("modal-degraded-status");
  if (degradedEl) {
    degradedEl.textContent = health.degraded.length ? health.degraded.join(" / ") : "正常稼働中";
  }
}

export function openSystemErrorModal(health: Health): void {
  const sem = document.getElementById("system-error-modal") as HTMLDialogElement | null;
  if (!sem) return;

  const degradedList = document.getElementById("system-degraded-list");
  if (degradedList) {
    degradedList.textContent = health.degraded.length
      ? health.degraded.join("\n")
      : "現在検出されているシステム障害はありません。";
  }

  const failedSec = document.getElementById("system-failed-jobs-section");
  const failedList = document.getElementById("system-failed-jobs-list");
  if (failedSec && failedList) {
    if (health.failed_jobs && health.failed_jobs.length > 0) {
      failedSec.style.display = "block";
      failedList.innerHTML = health.failed_jobs
        .map(
          (j) =>
            `<div class="failed-job-card">` +
            `<div class="failed-job-header">` +
            `<span>${esc(j.repo)}#${j.issue_number} (${esc(j.job_type)})</span>` +
            `<span>${ago(j.completed_at)}</span>` +
            `</div>` +
            `<div class="failed-job-reason">${esc(j.summary)}</div>` +
            `</div>`,
        )
        .join("");
    } else {
      failedSec.style.display = "none";
    }
  }

  sem.showModal();
}

export async function openErrorModal(c: Card): Promise<void> {
  const errorModal = document.getElementById("error-modal") as HTMLDialogElement | null;
  if (!errorModal) return;

  const titleEl = document.getElementById("error-modal-title");
  if (titleEl) {
    titleEl.textContent = `⚠️ エラー原因 (${c.repo}#${c.issue_number})`;
  }

  const issueTitleEl = document.getElementById("error-modal-issue-title");
  if (issueTitleEl) {
    issueTitleEl.textContent = `${c.title || "(no title)"}`;
  }

  const badgesEl = document.getElementById("error-modal-badges");
  if (badgesEl) {
    let bHtml = `<span class="tag-badge warn">${esc(c.display_hint)}</span>`;
    bHtml += `<span class="tag-badge">${esc(c.repo)}#${c.issue_number}</span>`;
    if (c.error_detail?.job_type) {
      bHtml += `<span class="tag-badge">ジョブ: ${esc(c.error_detail.job_type)}</span>`;
    }
    if (c.error_detail?.result) {
      bHtml += `<span class="tag-badge warn">${esc(c.error_detail.result)}</span>`;
    }
    if (c.error_detail?.occurred_at) {
      bHtml += `<span class="tag-badge">発生: ${ago(c.error_detail.occurred_at)}</span>`;
    }
    badgesEl.innerHTML = bHtml;
  }

  const reasonEl = document.getElementById("error-modal-reason");
  if (reasonEl) {
    reasonEl.textContent =
      c.error_detail?.summary || "エラー理由が記録されていません。詳細はログを確認してください。";
  }

  const historySection = document.getElementById("error-history-section");
  const historyList = document.getElementById("error-modal-history");
  const historyCount = document.getElementById("error-history-count");

  if (historySection && historyList && historyCount) {
    if (c.error_history && c.error_history.length > 1) {
      historySection.style.display = "block";
      historyCount.textContent = String(c.error_history.length);
      historyList.innerHTML = '<div class="empty">読み込み中...</div>';
      try {
        const res = await fetch(
          `/api/render/error?repo=${encodeURIComponent(c.repo)}&issue=${c.issue_number}`,
        );
        const data = (await res.json()) as { error_history_html: string };
        historyList.innerHTML = data.error_history_html;
      } catch {
        historyList.innerHTML = '<div class="empty">エラー履歴の取得に失敗しました</div>';
      }
    } else {
      historySection.style.display = "none";
    }
  }

  const issueLink = document.getElementById("error-modal-issue-link") as HTMLAnchorElement | null;
  if (issueLink) {
    issueLink.href = `https://github.com/${c.repo}/issues/${c.issue_number}`;
  }

  errorModal.showModal();
}

export async function openHistoryModal(c: Card): Promise<void> {
  const historyModal = document.getElementById("history-modal") as HTMLDialogElement | null;
  if (!historyModal) return;

  const titleEl = document.getElementById("history-modal-title");
  if (titleEl) {
    titleEl.textContent = `${c.repo}#${c.issue_number} - ${c.title}`;
  }

  const countEl = document.getElementById("history-modal-count");
  if (countEl) {
    countEl.textContent = "ジョブ実行履歴";
  }

  const timelineEl = document.getElementById("history-modal-timeline");
  if (timelineEl) {
    timelineEl.innerHTML = '<div class="loading-spinner">履歴を取得中...</div>';
  }

  historyModal.showModal();

  if (timelineEl) {
    try {
      const res = await fetch(
        `/api/render/history?repo=${encodeURIComponent(c.repo)}&issue=${c.issue_number}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { timeline_html: string };
        timelineEl.innerHTML =
          data.timeline_html || '<div class="empty">実行履歴はありません</div>';
      } else {
        timelineEl.innerHTML = '<div class="empty">履歴の取得に失敗しました</div>';
      }
    } catch {
      timelineEl.innerHTML = '<div class="empty">履歴の取得中にエラーが発生しました</div>';
    }
  }
}

export function initModals(): void {
  const infoBtn = document.getElementById("info-btn");
  const infoModal = document.getElementById("info-modal") as HTMLDialogElement | null;
  const infoCloseBtn = document.getElementById("info-modal-close");
  const errorModal = document.getElementById("error-modal") as HTMLDialogElement | null;
  const errorCloseBtn = document.getElementById("error-modal-close");
  const systemErrorModal = document.getElementById(
    "system-error-modal",
  ) as HTMLDialogElement | null;
  const systemErrorCloseBtn = document.getElementById("system-error-modal-close");
  const historyModal = document.getElementById("history-modal") as HTMLDialogElement | null;
  const historyCloseBtn = document.getElementById("history-modal-close");

  if (infoBtn && infoModal) {
    infoBtn.addEventListener("click", () => infoModal.showModal());
  }
  if (infoCloseBtn && infoModal) {
    infoCloseBtn.addEventListener("click", () => infoModal.close());
  }
  if (errorCloseBtn && errorModal) {
    errorCloseBtn.addEventListener("click", () => errorModal.close());
  }
  if (systemErrorCloseBtn && systemErrorModal) {
    systemErrorCloseBtn.addEventListener("click", () => systemErrorModal.close());
  }
  if (historyCloseBtn && historyModal) {
    historyCloseBtn.addEventListener("click", () => historyModal.close());
  }

  for (const modal of [infoModal, errorModal, systemErrorModal, historyModal]) {
    if (modal) {
      modal.addEventListener("click", (e) => {
        const rect = modal.getBoundingClientRect();
        const isInDialog =
          rect.top <= e.clientY &&
          e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX &&
          e.clientX <= rect.left + rect.width;
        if (!isInDialog) {
          modal.close();
        }
      });
    }
  }
}
