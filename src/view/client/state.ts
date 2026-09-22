import type { Card, Health, StateResponse } from "../../api/state.ts";

/**
 * クライアント側のメモリキャッシュとグローバル状態管理
 */
export const cardCache = new Map<string, Card>();
let latestHealth: Health | null = null;

export function getLatestHealth(): Health | null {
  return latestHealth;
}

export function setLatestHealth(h: Health | null): void {
  latestHealth = h;
}

export function registerCards(lanes: StateResponse["lanes"]): void {
  for (const cards of Object.values(lanes)) {
    for (const card of cards) {
      cardCache.set(`${card.repo}#${card.issue_number}`, card);
    }
  }
}

export function registerDoneCards(cards: Card[]): void {
  for (const card of cards) {
    cardCache.set(`${card.repo}#${card.issue_number}`, card);
  }
}

export function getInitialState(): StateResponse | null {
  const win = window as unknown as { __AUTOPILOT_INITIAL_STATE__?: StateResponse };
  return win.__AUTOPILOT_INITIAL_STATE__ || null;
}

export function getDoneInitialData(): { cards: Card[]; health: Health | null } | null {
  const win = window as unknown as {
    __AUTOPILOT_DONE_CARDS__?: Card[];
    __AUTOPILOT_HEALTH__?: Health;
  };
  if (win.__AUTOPILOT_DONE_CARDS__) {
    return {
      cards: win.__AUTOPILOT_DONE_CARDS__,
      health: win.__AUTOPILOT_HEALTH__ || null,
    };
  }
  return null;
}
