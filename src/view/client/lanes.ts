import type { RenderedLanes } from "../render.tsx";
import {
  clearRelationConnectors,
  drawRelationConnectors,
  getActiveHoverCard,
  setActiveHoverCard,
} from "./connectors.ts";
import { updateInfoModal } from "./modals.ts";
import { registerCards, setLatestHealth } from "./state.ts";

export async function refreshLanes(): Promise<void> {
  try {
    const r = await fetch("/api/render/lanes");
    const d = (await r.json()) as RenderedLanes;
    setLatestHealth(d.state.health);
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

    const activeHoverCard = getActiveHoverCard();
    if (activeHoverCard) {
      const currentKey = activeHoverCard.getAttribute("data-key");
      const freshCard = currentKey
        ? document.querySelector<HTMLElement>(`[data-key="${currentKey}"]`)
        : null;
      if (freshCard) {
        setActiveHoverCard(freshCard);
        drawRelationConnectors(freshCard);
      } else {
        setActiveHoverCard(null);
        clearRelationConnectors();
      }
    }
  } catch {
    const banner = document.getElementById("banner");
    if (banner) banner.innerHTML = '<div class="banner">autopilot に接続できません</div>';
  }
}

export function initLanes(): void {
  void refreshLanes();
  let timer = setInterval(refreshLanes, 4000);

  window.addEventListener("autopilot:refresh", () => {
    void refreshLanes();
  });

  document.addEventListener("visibilitychange", () => {
    clearInterval(timer);
    if (!document.hidden) {
      void refreshLanes();
      timer = setInterval(refreshLanes, 4000);
    }
  });
}
