import { BannerComponent } from "./components/Banner.tsx";
import { CardComponent } from "./components/Card.tsx";
import { ErrorHistoryListComponent } from "./components/ErrorModal.tsx";
import { HistoryTimelineComponent } from "./components/HistoryModal.tsx";
import type { Card, CardErrorItem, JobHistoryItem, StateResponse } from "./state.ts";

export interface RenderedLanes {
  action_required: string;
  working: string;
  queued: string;
  backlog: string;
  banner: string;
  meta: string;
  state: StateResponse;
}

export function renderLanes(state: StateResponse): RenderedLanes {
  const renderCards = (cards: Card[]): string => {
    if (!cards.length) return '<div class="empty">なし</div>';
    return cards.map((c) => (<CardComponent card={c} />).toString()).join("");
  };

  const bannerHtml = state.health.degraded.length
    ? (<BannerComponent degraded={state.health.degraded} />).toString()
    : "";

  return {
    action_required: renderCards(state.lanes.action_required),
    working: renderCards(state.lanes.working),
    queued: renderCards(state.lanes.queued),
    backlog: renderCards(state.lanes.backlog),
    banner: bannerHtml,
    meta: `実行中 ${state.health.running_jobs}`,
    state,
  };
}

export function renderHistoryTimeline(history?: JobHistoryItem[]): string {
  return (<HistoryTimelineComponent history={history} />).toString();
}

export function renderErrorHistory(history?: CardErrorItem[]): string {
  return (<ErrorHistoryListComponent history={history} />).toString();
}
