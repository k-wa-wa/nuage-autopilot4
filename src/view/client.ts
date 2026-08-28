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
    return m < 1 ? "たった今" : m < 60 ? `${m}分` : m < 1440 ? `${Math.floor(m / 60)}時間` : `${Math.floor(m / 1440)}日`;
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
    el.innerHTML = cards
      .map((c) => {
        const bits = [`${c.repo}#${c.issue_number}`];
        if (c.queue_position) bits.push(`${c.queue_position}番目`);
        if (c.job_type) bits.push(`${c.job_type} ${ago(c.started_at)}`);
        else bits.push(ago(c.state_since));
        return (
          `<a class="card" href="${c.url}" target="_blank" rel="noreferrer">` +
          `<div class="t">${esc(c.title || "(no title)")}</div>` +
          `<div class="s"><span class="hint">${esc(c.display_hint)}</span><span>${bits.map(esc).join(" · ")}</span></div></a>`
        );
      })
      .join("");
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
        meta.textContent = `GraphQL ${s.health.graphql_remaining} · 実行中 ${s.health.running_jobs}`;
      }
      const banner = document.getElementById("banner");
      if (banner) {
        banner.innerHTML = s.health.degraded.length
          ? `<div class="banner">${s.health.degraded.map(esc).join(" / ")}</div>`
          : "";
      }
    } catch {
      const banner = document.getElementById("banner");
      if (banner) banner.innerHTML = '<div class="banner">autopilot に接続できません</div>';
    }
  }

  refresh();
  let t = setInterval(refresh, 4000);
  document.addEventListener("visibilitychange", () => {
    clearInterval(t);
    if (!document.hidden) {
      refresh();
      t = setInterval(refresh, 4000);
    }
  });
}
