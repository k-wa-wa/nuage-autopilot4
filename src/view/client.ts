import type { RenderedLanes } from "./render.tsx";
import type { Card, Health, StateResponse } from "./state.ts";

/**
 * ブラウザ側で実行されるダッシュボードのクライアントロジック。
 *
 * page.tsx から関数文字列として埋め込まれるため、
 * 関数の外部スコープに依存せず、内部で完結させる。
 */
export function initClient(): void {
  const win = window as unknown as {
    __AUTOPILOT_INITIAL_STATE__?: StateResponse;
    __AUTOPILOT_DONE_CARDS__?: Card[];
    __AUTOPILOT_HEALTH__?: Health;
  };
  const initialData: StateResponse | null = win.__AUTOPILOT_INITIAL_STATE__ || null;
  // 完了ページ（/done）。ポーリングは行わず、カードと health のスナップショットは SSR 済みのものをそのまま使う。
  const doneCards = win.__AUTOPILOT_DONE_CARDS__ || null;
  const doneHealth = win.__AUTOPILOT_HEALTH__ || null;

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
  let latestHealth: StateResponse["health"] | null = null;

  function registerCards(lanes: StateResponse["lanes"]): void {
    for (const cards of Object.values(lanes)) {
      for (const card of cards) {
        cardCache.set(`${card.repo}#${card.issue_number}`, card);
      }
    }
  }

  function updateInfoModal(health: StateResponse["health"]): void {
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

  async function openErrorModal(c: Card): Promise<void> {
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
      issueLink.href = c.issue_url || c.url;
    }

    errorModal.showModal();
  }

  async function openHistoryModal(c: Card): Promise<void> {
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
      timelineEl.innerHTML = '<div class="timeline-empty">読み込み中...</div>';
      try {
        const res = await fetch(
          `/api/render/history?repo=${encodeURIComponent(c.repo)}&issue=${c.issue_number}`,
        );
        const data = (await res.json()) as { timeline_html: string };
        timelineEl.innerHTML = data.timeline_html;
      } catch {
        timelineEl.innerHTML = '<div class="timeline-empty">実行履歴の取得に失敗しました</div>';
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

  // 親子関係コネクタ線の描画と相互ハイライト
  let activeHoverCard: HTMLElement | null = null;

  function clearRelationConnectors(): void {
    const layer =
      document.getElementById("relation-connector-layer") ||
      document.getElementById("relation-connector-canvas");
    if (layer) layer.innerHTML = "";
    const activeCards = document.querySelectorAll(
      ".relation-active, .relation-target, .relation-parent, .relation-child",
    );
    for (const el of activeCards) {
      el.classList.remove(
        "relation-active",
        "relation-target",
        "relation-parent",
        "relation-child",
      );
    }
  }

  function drawRelationConnectors(card: HTMLElement): void {
    const layer =
      document.getElementById("relation-connector-layer") ||
      document.getElementById("relation-connector-canvas");
    if (!layer) return;

    clearRelationConnectors();

    const cardKey = card.getAttribute("data-key");
    const parentKey = card.getAttribute("data-parent-key");
    if (!cardKey) return;

    // 接続対象ペアの収集（親 ↔ 子）
    const targetPairs: Array<{ parent: HTMLElement; child: HTMLElement }> = [];

    if (parentKey) {
      // 自身が子カードの場合: 親カードを探す
      const parentEl = document.querySelector<HTMLElement>(`[data-key="${parentKey}"]`);
      if (parentEl && parentEl.offsetParent !== null) {
        targetPairs.push({ parent: parentEl, child: card });
      }
    }

    // 自身が親カードの場合: 自身を親とする子カード群を探す
    const childEls = document.querySelectorAll<HTMLElement>(`[data-parent-key="${cardKey}"]`);
    for (const ch of childEls) {
      if (ch.offsetParent !== null) {
        targetPairs.push({ parent: card, child: ch });
      }
    }

    if (targetPairs.length === 0) return;

    card.classList.add("relation-active");

    let svgInner = "";
    for (const pair of targetPairs) {
      const isTargetParent = pair.parent !== card;
      const targetEl = isTargetParent ? pair.parent : pair.child;
      targetEl.classList.add("relation-target");

      // 親カードと子カードを明示的にクラス付与して区別
      pair.parent.classList.add("relation-parent");
      pair.child.classList.add("relation-child");

      const rectP = pair.parent.getBoundingClientRect();
      const rectC = pair.child.getBoundingClientRect();

      let x1 = 0;
      let y1 = 0;
      let x2 = 0;
      let y2 = 0;
      let cx1 = 0;
      let cy1 = 0;
      let cx2 = 0;
      let cy2 = 0;

      // 常に親を始点 (x1, y1)、子を終点 (x2, y2) として幾何学配置を決定
      if (rectP.right < rectC.left) {
        // 親が左、子が右
        x1 = rectP.right;
        y1 = rectP.top + rectP.height * 0.5;
        x2 = rectC.left;
        y2 = rectC.top + rectC.height * 0.5;
        const dx = (x2 - x1) * 0.5;
        cx1 = x1 + dx;
        cy1 = y1;
        cx2 = x2 - dx;
        cy2 = y2;
      } else if (rectC.right < rectP.left) {
        // 子が左、親が右（親の左端から子の右端へ向かう）
        x1 = rectP.left;
        y1 = rectP.top + rectP.height * 0.5;
        x2 = rectC.right;
        y2 = rectC.top + rectC.height * 0.5;
        const dx = (x1 - x2) * 0.5;
        cx1 = x1 - dx;
        cy1 = y1;
        cx2 = x2 + dx;
        cy2 = y2;
      } else {
        // 横位置が重なっている場合（同一カラムなど）
        if (rectP.bottom <= rectC.top) {
          // 親が上、子が下
          x1 = rectP.left + rectP.width * 0.5;
          y1 = rectP.bottom;
          x2 = rectC.left + rectC.width * 0.5;
          y2 = rectC.top;
          const dy = (y2 - y1) * 0.5;
          cx1 = x1;
          cy1 = y1 + dy;
          cx2 = x2;
          cy2 = y2 - dy;
        } else {
          // 親が下、子が上
          x1 = rectP.left + rectP.width * 0.5;
          y1 = rectP.top;
          x2 = rectC.left + rectC.width * 0.5;
          y2 = rectC.bottom;
          const dy = (y1 - y2) * 0.5;
          cx1 = x1;
          cy1 = y1 - dy;
          cx2 = x2;
          cy2 = y2 + dy;
        }
      }

      // 親から子に向かう破線パス（破線アニメーションで方向を表現）
      svgInner += `<path class="relation-path" d="M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}" />`;
      // 始点・終点両端の丸ドット（丸と丸）
      svgInner += `<circle class="relation-dot" cx="${x1}" cy="${y1}" r="3.5" />`;
      svgInner += `<circle class="relation-dot" cx="${x2}" cy="${y2}" r="3.5" />`;
    }

    layer.innerHTML = svgInner;
  }

  async function refresh(): Promise<void> {
    try {
      const r = await fetch("/api/render/lanes");
      const d = (await r.json()) as RenderedLanes;
      latestHealth = d.state.health;
      registerCards(d.state.lanes);

      const laneKeys = ["action_required", "working", "queued", "backlog"] as const;
      for (const k of laneKeys) {
        const el = document.getElementById(k);
        if (el && d[k] !== undefined) {
          el.innerHTML = d[k];
        }
      }

      const banner = document.getElementById("banner");
      if (banner && d.banner !== undefined) {
        banner.innerHTML = d.banner;
      }

      updateInfoModal(d.state.health);

      if (activeHoverCard) {
        const currentKey = activeHoverCard.getAttribute("data-key");
        const freshCard = currentKey
          ? document.querySelector<HTMLElement>(`[data-key="${currentKey}"]`)
          : null;
        if (freshCard) {
          activeHoverCard = freshCard;
          drawRelationConnectors(freshCard);
        } else {
          activeHoverCard = null;
          clearRelationConnectors();
        }
      }
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
        void openErrorModal(cardCache.get(key)!);
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
        void openHistoryModal(cardCache.get(key)!);
      }
      return;
    }

    const debugTarget = (e.target as HTMLElement | null)?.closest(
      ".card-debug-trigger",
    ) as HTMLElement | null;
    if (debugTarget) {
      e.preventDefault();
      e.stopPropagation();
      const key = debugTarget.getAttribute("data-key");
      if (key && cardCache.has(key)) {
        openChat(cardCache.get(key)!);
      }
      return;
    }
  });

  // カードのホバーによる親子コネクタ線の制御
  document.addEventListener("mouseover", (e) => {
    const target = (e.target as HTMLElement | null)?.closest(".card") as HTMLElement | null;
    if (target && target !== activeHoverCard) {
      activeHoverCard = target;
      drawRelationConnectors(target);
    }
  });

  document.addEventListener("mouseout", (e) => {
    const target = (e.target as HTMLElement | null)?.closest(".card") as HTMLElement | null;
    const related = (e.relatedTarget as HTMLElement | null)?.closest(".card") as HTMLElement | null;
    if (target && target === activeHoverCard && (!related || related !== activeHoverCard)) {
      activeHoverCard = null;
      clearRelationConnectors();
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      if (activeHoverCard) {
        drawRelationConnectors(activeHoverCard);
      }
    },
    { passive: true },
  );

  window.addEventListener("resize", () => {
    if (activeHoverCard) {
      drawRelationConnectors(activeHoverCard);
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

  // ── AI 調査アシスタント（Antigravity IDE Style 画面分割パネル）の制御 ──
  const chatPane = document.getElementById("chat-pane");
  const paneResizer = document.getElementById("pane-resizer");
  const chatCloseBtn = document.getElementById("chat-close-btn");
  const chatHeaderBtn = document.getElementById("chat-header-btn");
  const chatMessages = document.getElementById("chat-messages");
  const chatContextChips = document.getElementById("chat-context-chips");
  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  const chatSendBtn = document.getElementById("chat-send-btn") as HTMLButtonElement | null;
  const chatEngineSelect = document.getElementById(
    "chat-engine-select",
  ) as HTMLSelectElement | null;

  let currentChatCard: Card | null = null;
  let currentConversationId: string | null = null;
  let isChatStreaming = false;

  // 保存されているエンジン選択の復元
  if (chatEngineSelect) {
    const savedEngine = localStorage.getItem("autopilot_chat_engine");
    if (savedEngine === "agy" || savedEngine === "claude") {
      chatEngineSelect.value = savedEngine;
    }
    chatEngineSelect.addEventListener("change", () => {
      localStorage.setItem("autopilot_chat_engine", chatEngineSelect.value);
      // エンジンを切り替えた場合はセッションIDをリセット
      currentConversationId = null;
    });
  }

  const renderSimpleMarkdown = (text: string): string => {
    const e = (str: string) =>
      str.replace(
        /[&<>"]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] || c,
      );

    const codeBlocks: string[] = [];
    let processed = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre><code>${e(code.trim())}</code></pre>`);
      return `%%CODEBLOCK_${idx}%%`;
    });

    processed = processed.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    processed = processed.replace(/^## (.*$)/gim, "<h3>$1</h3>");
    processed = processed.replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>");
    processed = processed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    processed = processed.replace(/`([^`]+)`/g, (_match, code) => `<code>${e(code)}</code>`);
    processed = processed.replace(/^\s*[-*]\s+(.*$)/gim, "<li>$1</li>");
    processed = processed.replace(/\n\n/g, "<br><br>");

    processed = processed.replace(
      /%%CODEBLOCK_(\d+)%%/g,
      (_match, idx) => codeBlocks[Number(idx)] || "",
    );

    return processed;
  };

  const applySavedPaneWidth = (): void => {
    if (!chatPane) return;
    const saved = localStorage.getItem("autopilot_chat_pane_width");
    if (saved) {
      const w = Number.parseInt(saved, 10);
      if (!Number.isNaN(w) && w >= 280 && w <= window.innerWidth * 0.8) {
        chatPane.style.width = `${w}px`;
      }
    }
  };

  /**
   * Antigravity IDE 風のコンテキストチップ（メンションタグ）を描画
   */
  const renderContextChips = () => {
    if (!chatContextChips) return;

    if (!currentChatCard) {
      chatContextChips.innerHTML = "";
      chatContextChips.style.display = "none";
      if (chatInput) {
        chatInput.placeholder = "質問や指示を入力... (Enterで送信, Shift+Enterで改行)";
      }
      return;
    }

    const c = currentChatCard;
    const cardKey = `${c.repo}#${c.issue_number}`;
    let html = "";

    // 1. Issue / PR コンテキストチップ (Antigravity IDE の [M↓ AGENTS.md #L58] スタイル)
    html += `
      <div class="agy-chip issue-chip" title="アタッチされたコンテキスト">
        <span class="chip-icon">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.69C0 12.48.52 13 1.15 13h13.69c.64 0 1.15-.52 1.15-1.15V4.15C16 3.52 15.48 3 14.85 3zM9 11H7V8L5.5 9.9 4 8v3H2V5h2l1.5 2L7 5h2v6zm2.99.5L9.5 8H11V5h2v3h1.5l-2.51 3.5z"/></svg>
        </span>
        <span class="chip-text">${esc(cardKey)}</span>
        <button type="button" class="chip-close" data-remove="card" title="コンテキストを解除">×</button>
      </div>
    `;

    // 2. エラーコンテキストチップ（エラーがある場合）
    if (c.error_detail) {
      const summaryShort =
        c.error_detail.summary.length > 28
          ? `${c.error_detail.summary.slice(0, 28)}…`
          : c.error_detail.summary;
      html += `
        <div class="agy-chip error-chip" title="直近のエラー情報">
          <span class="chip-icon">⚠️</span>
          <span class="chip-text">Error: ${esc(summaryShort)}</span>
        </div>
      `;
    }

    chatContextChips.innerHTML = html;
    chatContextChips.style.display = "flex";

    if (chatInput) {
      chatInput.placeholder = `${c.repo}#${c.issue_number} について指示を入力、またはこのまま送信...`;
    }
  };

  // チップの解除イベント
  if (chatContextChips) {
    chatContextChips.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const removeBtn = target.closest(".chip-close");
      if (removeBtn) {
        e.stopPropagation();
        currentChatCard = null;
        renderContextChips();
      }
    });
  }

  const openChat = (card?: Card | null): void => {
    if (!chatPane || !paneResizer) return;
    currentChatCard = card || null;

    applySavedPaneWidth();
    chatPane.style.display = "flex";
    paneResizer.style.display = "block";
    chatPane.setAttribute("aria-hidden", "false");

    renderContextChips();
    chatInput?.focus();
  };

  const closeChat = (): void => {
    if (!chatPane || !paneResizer) return;
    chatPane.style.display = "none";
    paneResizer.style.display = "none";
    chatPane.setAttribute("aria-hidden", "true");
  };

  const toggleChat = (): void => {
    if (chatPane && chatPane.style.display === "flex") {
      closeChat();
    } else {
      openChat(currentChatCard);
    }
  };

  const appendUserMessage = (msg: string, card: Card | null) => {
    if (!chatMessages) return;
    const div = document.createElement("div");
    div.className = "chat-msg user";

    let pinHtml = "";
    if (card) {
      pinHtml = `<div class="msg-context-pin">📎 ${esc(card.repo)}#${card.issue_number}</div>`;
    }

    div.innerHTML = `${pinHtml}<div class="msg-bubble">${esc(msg)}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  const startChatInvestigation = async (userPrompt: string) => {
    if (isChatStreaming || !chatMessages) return;
    isChatStreaming = true;
    if (chatSendBtn) chatSendBtn.disabled = true;

    const snapshotCard = currentChatCard;
    // 送信後、ピン留めされたコンテキストチップと入力欄をクリア
    currentChatCard = null;
    renderContextChips();
    if (chatInput) chatInput.value = "";

    const promptToSend =
      userPrompt.trim() ||
      (snapshotCard?.error_detail
        ? `直近のエラー「${snapshotCard.error_detail.summary}」の原因と対処法を調査してください。`
        : snapshotCard
          ? `このアイテムが現在「${snapshotCard.display_hint}」となっている原因と現在の状況を調査してください。`
          : "システム全体の状況を調査してください。");

    appendUserMessage(userPrompt.trim() || promptToSend, snapshotCard);

    const assistantDiv = document.createElement("div");
    assistantDiv.className = "chat-msg assistant";

    const thinkingAccordion = document.createElement("details");
    thinkingAccordion.className = "thinking-accordion";
    thinkingAccordion.open = true;
    thinkingAccordion.innerHTML =
      '<summary>💭 Thinking (思考中...)</summary><pre class="thinking-content"></pre>';
    const thinkingPre = thinkingAccordion.querySelector(".thinking-content") as HTMLPreElement;

    const toolContainer = document.createElement("div");
    toolContainer.className = "tool-call-container";

    const bubbleDiv = document.createElement("div");
    bubbleDiv.className = "msg-bubble";
    bubbleDiv.innerHTML = '<span class="meta">調査中...</span>';

    assistantDiv.appendChild(thinkingAccordion);
    assistantDiv.appendChild(toolContainer);
    assistantDiv.appendChild(bubbleDiv);
    chatMessages.appendChild(assistantDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    let rawText = "";
    let rawThinking = "";

    try {
      const selectedEngine = (chatEngineSelect?.value as "agy" | "claude") || "agy";
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: promptToSend,
          card: snapshotCard || undefined,
          conversation_id: currentConversationId || undefined,
          engine: selectedEngine,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}: チャット接続に失敗しました`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "message";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (currentEvent === "init" && data.conversation_id) {
                currentConversationId = data.conversation_id;
              } else if (currentEvent === "thought" && data.delta) {
                rawThinking += data.delta;
                thinkingPre.textContent = rawThinking;
                chatMessages.scrollTop = chatMessages.scrollHeight;
              } else if (currentEvent === "tool_start") {
                const badge = document.createElement("div");
                badge.className = "tool-call-badge";
                badge.id = `tool-${data.id || data.name}`;
                badge.innerHTML = `<span class="tool-icon">🛠️</span> <span><code>${esc(data.name)}</code></span> <span class="tool-status running">実行中...</span>`;
                toolContainer.appendChild(badge);
                chatMessages.scrollTop = chatMessages.scrollHeight;
              } else if (currentEvent === "tool_end") {
                const badge = document.getElementById(`tool-${data.id || data.name}`);
                if (badge) {
                  const status = badge.querySelector(".tool-status");
                  if (status) {
                    status.className = "tool-status done";
                    status.textContent = "完了";
                  }
                }
              } else if (currentEvent === "text" && data.delta) {
                rawText += data.delta;
                bubbleDiv.innerHTML = renderSimpleMarkdown(rawText);
                chatMessages.scrollTop = chatMessages.scrollHeight;
              } else if (currentEvent === "done") {
                const summary = thinkingAccordion.querySelector("summary");
                if (summary) summary.innerHTML = "💭 Thinking (完了)";
              } else if (currentEvent === "error") {
                bubbleDiv.innerHTML += `<div style="color: var(--warn); margin-top: 8px;">⚠️ エラー: ${esc(data.message)}</div>`;
              }
            } catch {
              // json パースエラー無視
            }
          }
        }
      }
    } catch (err) {
      bubbleDiv.innerHTML = `<div style="color: var(--warn);">⚠️ 調査中にエラーが発生しました: ${esc(String(err))}</div>`;
    } finally {
      isChatStreaming = false;
      if (chatSendBtn) chatSendBtn.disabled = false;
      chatInput?.focus();
    }
  };

  // ── スプリッター（ドラッグによる画面分割比率の調整） ──
  if (paneResizer && chatPane) {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    paneResizer.addEventListener("mousedown", (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = chatPane.getBoundingClientRect().width;
      paneResizer.classList.add("resizing");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const dx = startX - e.clientX;
      const minW = 280;
      const maxW = Math.max(minW, Math.floor(window.innerWidth * 0.75));
      const newWidth = Math.max(minW, Math.min(maxW, startWidth + dx));
      chatPane.style.width = `${newWidth}px`;
      localStorage.setItem("autopilot_chat_pane_width", String(Math.round(newWidth)));
    });

    document.addEventListener("mouseup", () => {
      if (!isResizing) return;
      isResizing = false;
      paneResizer.classList.remove("resizing");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    });
  }

  // パネル開閉イベント登録
  if (chatCloseBtn) chatCloseBtn.addEventListener("click", closeChat);
  if (chatHeaderBtn) chatHeaderBtn.addEventListener("click", toggleChat);

  // クイック質問チップスのクリック
  document.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement | null)?.closest(".quick-chip") as HTMLElement | null;
    if (chip) {
      const prompt = chip.getAttribute("data-prompt");
      if (prompt) {
        if (chatPane?.style.display !== "flex") {
          openChat(null);
        }
        void startChatInvestigation(prompt);
      }
    }
  });

  // Antigravity IDE 風送信ハンドラー
  const handleComposerSubmit = () => {
    if (!chatInput || isChatStreaming) return;
    const val = chatInput.value;
    chatInput.value = "";
    void startChatInvestigation(val);
  };

  if (chatSendBtn) {
    chatSendBtn.addEventListener("click", handleComposerSubmit);
  }

  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleComposerSubmit();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && chatPane && chatPane.style.display === "flex") {
      closeChat();
    }
  });

  // 初期化：SSR データがあれば即座に反映
  if (doneCards) {
    for (const card of doneCards) {
      cardCache.set(`${card.repo}#${card.issue_number}`, card);
    }
    if (doneHealth) {
      latestHealth = doneHealth;
      updateInfoModal(doneHealth);
    }
    // dev のシナリオ切替など、外部からの更新要求はリロードで反映する
    window.addEventListener("autopilot:refresh", () => {
      window.location.reload();
    });
    return;
  }

  if (initialData) {
    latestHealth = initialData.health;
    registerCards(initialData.lanes);
    updateInfoModal(initialData.health);
  }

  void refresh();
  let t = setInterval(refresh, 4000);
  window.addEventListener("autopilot:refresh", () => {
    void refresh();
  });
  document.addEventListener("visibilitychange", () => {
    clearInterval(t);
    if (!document.hidden) {
      void refresh();
      t = setInterval(refresh, 4000);
    }
  });
}
