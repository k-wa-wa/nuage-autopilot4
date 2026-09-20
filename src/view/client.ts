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

  const parseResetMs = (str: string): number => {
    const ms = Date.parse(str);
    if (!Number.isNaN(ms)) return ms;

    const m = str.match(
      /(?:resets\s+)?([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(?:at)?\s*|\s+)(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)(?:\s*\(([^)]+)\))?/i,
    );
    if (m) {
      const [, monStr, dayStr, hourStr, minStr, ampm, tz] = m;
      const months: Record<string, number> = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11,
      };
      const mon = months[monStr?.toLowerCase().slice(0, 3) ?? ""];
      if (mon !== undefined) {
        const day = Number.parseInt(dayStr ?? "1", 10);
        let hour = Number.parseInt(hourStr ?? "0", 10);
        const min = minStr ? Number.parseInt(minStr, 10) : 0;
        if (ampm?.toLowerCase() === "pm" && hour < 12) hour += 12;
        if (ampm?.toLowerCase() === "am" && hour === 12) hour = 0;

        const now = new Date();
        let year = now.getFullYear();
        if (mon < now.getMonth() - 6) year += 1;

        const pad = (n: number) => String(n).padStart(2, "0");
        let tzOffset = "+09:00";
        if (tz === "Asia/Tokyo" || tz === "JST") tzOffset = "+09:00";
        else if (tz === "UTC" || tz === "GMT") tzOffset = "Z";

        const d = new Date(
          `${year}-${pad(mon + 1)}-${pad(day)}T${pad(hour)}:${pad(min)}:00${tzOffset}`,
        );
        if (!Number.isNaN(d.getTime())) return d.getTime();
      }
    }
    return Number.NaN;
  };

  const formatReset = (iso: string | null): string => {
    if (!iso) return "--";
    const resetMs = parseResetMs(iso);
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

  const formatPollTime = (iso: string | null): string => (iso ? ago(iso) : "未実行");

  const esc = (s: unknown): string =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c,
    );

  // カードデータのキャッシュ（repo#issue -> Card）
  const cardCache = new Map<string, Card>();

  function render(lane: string, cards: Card[]): void {
    const el = document.getElementById(lane);
    if (!el) return;
    if (!cards.length) {
      el.innerHTML = '<div class="empty">なし</div>';
      return;
    }
    const prIcon =
      '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"></path></svg>';
    const warnIcon =
      '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>';
    const historyIcon =
      '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8.5 4.5a.5.5 0 0 0-1 0v3.793l-2.146 2.147a.5.5 0 0 0 .708.708l2.5-2.5A.5.5 0 0 0 8.5 8.5V4.5z"/><path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm0 1A8 8 0 1 1 8 0a8 8 0 0 1 0 16z"/></svg>';

    el.innerHTML = cards
      .map((c) => {
        const cardKey = `${c.repo}#${c.issue_number}`;
        cardCache.set(cardKey, c);

        const hasError = [
          "エラー対応待ち",
          "CI 失敗（要判断）",
          "Triage 失敗（要判断）",
          "CI 停滞",
          "助言待ち",
          "中止済み",
        ].includes(c.display_hint);

        const bits = [c.repo, `#${c.issue_number}`];
        if (c.queue_position) bits.push(`待ち順位 #${c.queue_position}`);
        if (c.job_type) bits.push(`ジョブ: ${c.job_type}`);
        if (c.started_at) bits.push(`開始: ${ago(c.started_at)}`);
        const issueUrl = c.issue_url || c.url;

        // カード右上に固定配置するジョブ履歴ボタン（1回以上実行されているカードに表示）
        let historyBtnHtml = "";
        const historyCount = c.job_history?.length ?? 0;
        if (historyCount > 0) {
          historyBtnHtml = `<button type="button" class="card-history-btn card-history-trigger" data-key="${esc(cardKey)}" title="ジョブ実行履歴を表示 (${historyCount}回実行)">${historyIcon}<span>${historyCount}</span></button>`;
        }

        // エラー行（エラーがある場合のみ独立して描画）
        let errorSubHtml = "";
        if (hasError && c.error_detail) {
          const summaryPreview = c.error_detail.summary.split("\n")[0] || "エラー詳細";
          const truncated =
            summaryPreview.length > 35 ? `${summaryPreview.slice(0, 35)}…` : summaryPreview;
          errorSubHtml =
            `<div class="card-sub">` +
            `<span class="sub-connector">└</span>` +
            `<button type="button" class="error-badge card-error-trigger" data-key="${esc(cardKey)}" title="クリックしてエラー詳細を表示: ${esc(c.error_detail.summary)}">${warnIcon}<span>エラー: ${esc(truncated)}</span></button>` +
            `</div>`;
        }

        // PR サブ行（PR がある場合のみ独立して描画）
        let prSubHtml = "";
        if (c.pr_url) {
          prSubHtml =
            `<div class="card-sub">` +
            `<span class="sub-connector">└</span>` +
            `<a class="pr-badge" href="${c.pr_url}" target="_blank" rel="noreferrer" title="PR を開く">${prIcon}<span>#${c.pr_number}</span></a>` +
            `</div>`;
        }

        const hintHtml = `<span class="hint">${esc(c.display_hint)}</span>`;

        return (
          `<div class="card${hasError ? " has-error" : ""}">` +
          historyBtnHtml +
          `<a class="card-main" href="${issueUrl}" target="_blank" rel="noreferrer" title="Issue を開く">` +
          `<div class="t">${esc(c.title || "(no title)")}</div>` +
          `<div class="s">${hintHtml}<span>${bits.map(esc).join(" · ")}</span></div>` +
          `</a>` +
          errorSubHtml +
          prSubHtml +
          `</div>`
        );
      })
      .join("");
  }

  function openErrorModal(c: Card): void {
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
        historyList.innerHTML = c.error_history
          .map(
            (h) =>
              `<div class="error-history-item">` +
              `<div class="error-history-header">` +
              `<span>${esc(h.job_type ? `ジョブ: ${h.job_type}` : "処理")} (${esc(h.result || "FAIL")})</span>` +
              `<span>${ago(h.occurred_at)}</span>` +
              `</div>` +
              `<div class="error-history-reason">${esc(h.summary)}</div>` +
              `</div>`,
          )
          .join("");
      } else {
        historySection.style.display = "none";
      }
    }

    const issueLink = document.getElementById("error-modal-issue-link") as HTMLAnchorElement | null;
    if (issueLink) {
      issueLink.href = c.issue_url || c.url;
    }

    errorModal.showModal();
  }

  function formatDuration(sec: number | null): string {
    if (sec == null) return "--";
    if (sec < 60) return `${sec}秒`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}分${s}秒` : `${m}分`;
  }

  function openHistoryModal(c: Card): void {
    const historyModal = document.getElementById("history-modal") as HTMLDialogElement | null;
    if (!historyModal) return;

    const titleEl = document.getElementById("history-modal-title");
    if (titleEl) {
      titleEl.textContent = `⏱️ ジョブ実行履歴 (${c.repo}#${c.issue_number})`;
    }

    const issueTitleEl = document.getElementById("history-modal-issue-title");
    if (issueTitleEl) {
      issueTitleEl.textContent = `${c.title || "(no title)"}`;
    }

    const badgesEl = document.getElementById("history-modal-badges");
    if (badgesEl) {
      let bHtml = `<span class="tag-badge">${esc(c.display_hint)}</span>`;
      bHtml += `<span class="tag-badge">${esc(c.repo)}#${c.issue_number}</span>`;
      if (c.pr_number > 0) {
        bHtml += `<span class="tag-badge">PR #${c.pr_number}</span>`;
      }
      const count = c.job_history?.length ?? 0;
      bHtml += `<span class="tag-badge">計 ${count} 回実行</span>`;
      badgesEl.innerHTML = bHtml;
    }

    const timelineEl = document.getElementById("history-modal-timeline");
    if (timelineEl) {
      if (!c.job_history || c.job_history.length === 0) {
        timelineEl.innerHTML = '<div class="timeline-empty">実行履歴がありません</div>';
      } else {
        timelineEl.innerHTML = c.job_history
          .map((item) => {
            const res = (item.result || "UNKNOWN").toLowerCase();
            let markerClass = "timeline-marker";
            let resClass = "timeline-result";
            if (res === "success") {
              markerClass += " success";
              resClass += " success";
            } else if (res === "fail" || res === "timeout") {
              markerClass += " fail";
              resClass += " fail";
            } else if (res === "blocked") {
              markerClass += " blocked";
              resClass += " blocked";
            } else if (res === "running") {
              markerClass += " running";
              resClass += " running";
            }

            const durationStr = formatDuration(item.duration_sec);
            const timeStr = ago(item.started_at);

            let bodyHtml = "";
            if (item.summary) {
              bodyHtml += `<div class="timeline-summary">${esc(item.summary)}</div>`;
            }
            if (item.next_context) {
              bodyHtml += `<div class="timeline-next-context"><strong>次のコンテキスト:</strong> ${esc(item.next_context)}</div>`;
            }

            return (
              `<div class="timeline-item">` +
              `<div class="${markerClass}"></div>` +
              `<div class="timeline-header">` +
              `<div class="timeline-title-group">` +
              `<span class="timeline-job-type">ジョブ: ${esc(item.job_type)}</span>` +
              `<span class="${resClass}">${esc(item.result || "UNKNOWN")}</span>` +
              `</div>` +
              `<div class="timeline-time-group">` +
              `<span>所要時間: <strong class="timeline-duration">${durationStr}</strong></span>` +
              `<span class="timeline-time">${timeStr}</span>` +
              `</div>` +
              `</div>` +
              (bodyHtml ? `<div class="timeline-body">${bodyHtml}</div>` : "") +
              `</div>`
            );
          })
          .join("");
      }
    }

    const issueLink = document.getElementById(
      "history-modal-issue-link",
    ) as HTMLAnchorElement | null;
    if (issueLink) {
      issueLink.href = c.issue_url || c.url;
    }

    const prLink = document.getElementById("history-modal-pr-link") as HTMLAnchorElement | null;
    if (prLink) {
      if (c.pr_url) {
        prLink.href = c.pr_url;
        prLink.style.display = "inline-flex";
      } else {
        prLink.style.display = "none";
      }
    }

    historyModal.showModal();
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

  let latestHealth: StateResponse["health"] | null = null;

  function openSystemErrorModal(health: StateResponse["health"]): void {
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

  async function refresh(): Promise<void> {
    try {
      const r = await fetch("/api/state");
      const s = (await r.json()) as StateResponse;
      latestHealth = s.health;
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
          ? `<div class="banner"><span>⚠️ ${s.health.degraded.map(esc).join(" / ")}</span><span class="banner-tap-hint">障害詳細を見る &rarr;</span></div>`
          : "";
      }
      updateModal(s.health);
    } catch {
      const banner = document.getElementById("banner");
      if (banner) banner.innerHTML = '<div class="banner">autopilot に接続できません</div>';
    }
  }

  // グローバルイベント委譲: カード内のボタンタップ（エラー詳細 / 実行履歴）
  document.addEventListener("click", (e) => {
    const errorTarget = (e.target as HTMLElement | null)?.closest(
      ".card-error-trigger",
    ) as HTMLElement | null;
    if (errorTarget) {
      e.preventDefault();
      e.stopPropagation();
      const key = errorTarget.getAttribute("data-key");
      if (key && cardCache.has(key)) {
        openErrorModal(cardCache.get(key)!);
      }
      return;
    }

    const historyTarget = (e.target as HTMLElement | null)?.closest(
      ".card-history-trigger",
    ) as HTMLElement | null;
    if (historyTarget) {
      e.preventDefault();
      e.stopPropagation();
      const key = historyTarget.getAttribute("data-key");
      if (key && cardCache.has(key)) {
        openHistoryModal(cardCache.get(key)!);
      }
      return;
    }
  });

  // バナーのクリックで専用のシステムエラーモーダルを開く
  const bannerEl = document.getElementById("banner");
  if (bannerEl) {
    bannerEl.addEventListener("click", () => {
      if (latestHealth) {
        openSystemErrorModal(latestHealth);
      }
    });
  }

  // システム・API情報モーダルダイアログの制御
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

  // カードエラー詳細モーダルの制御
  const errorModal = document.getElementById("error-modal") as HTMLDialogElement | null;
  const errorCloseBtn = document.getElementById("error-modal-close-btn");
  const errorDismissBtn = document.getElementById("error-modal-dismiss-btn");

  if (errorCloseBtn && errorModal) {
    errorCloseBtn.addEventListener("click", () => {
      errorModal.close();
    });
  }

  if (errorDismissBtn && errorModal) {
    errorDismissBtn.addEventListener("click", () => {
      errorModal.close();
    });
  }

  if (errorModal) {
    errorModal.addEventListener("click", (e) => {
      if (e.target === errorModal) {
        errorModal.close();
      }
    });
  }

  // システム障害・滞留ジョブモーダルの制御
  const sysErrorModal = document.getElementById("system-error-modal") as HTMLDialogElement | null;
  const sysErrorCloseBtn = document.getElementById("system-error-modal-close-btn");
  const sysErrorDismissBtn = document.getElementById("system-error-modal-dismiss-btn");

  if (sysErrorCloseBtn && sysErrorModal) {
    sysErrorCloseBtn.addEventListener("click", () => {
      sysErrorModal.close();
    });
  }

  if (sysErrorDismissBtn && sysErrorModal) {
    sysErrorDismissBtn.addEventListener("click", () => {
      sysErrorModal.close();
    });
  }

  if (sysErrorModal) {
    sysErrorModal.addEventListener("click", (e) => {
      if (e.target === sysErrorModal) {
        sysErrorModal.close();
      }
    });
  }

  // ジョブ実行履歴モーダルの制御
  const historyModal = document.getElementById("history-modal") as HTMLDialogElement | null;
  const historyCloseBtn = document.getElementById("history-modal-close-btn");

  if (historyCloseBtn && historyModal) {
    historyCloseBtn.addEventListener("click", () => {
      historyModal.close();
    });
  }

  if (historyModal) {
    historyModal.addEventListener("click", (e) => {
      if (e.target === historyModal) {
        historyModal.close();
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
