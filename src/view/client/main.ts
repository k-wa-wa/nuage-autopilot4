import { initChat, openChat } from "./chat.ts";
import { initConnectors } from "./connectors.ts";
import { initLanes } from "./lanes.ts";
import {
  initModals,
  openErrorModal,
  openHistoryModal,
  openSystemErrorModal,
  updateInfoModal,
} from "./modals.ts";
import {
  cardCache,
  getDoneInitialData,
  getInitialState,
  getLatestHealth,
  registerCards,
  registerDoneCards,
  setLatestHealth,
} from "./state.ts";

export function initClient(): void {
  initModals();
  initConnectors();
  initChat();

  // カードクリックイベント（モーダル・チャット調査トリガー）のデリゲーション
  document.addEventListener("click", (e) => {
    // 1. システムエラーバナーのクリック
    const systemErrorTrigger = (e.target as HTMLElement | null)?.closest(
      ".system-error-trigger",
    ) as HTMLElement | null;
    if (systemErrorTrigger) {
      const health = getLatestHealth();
      if (health) openSystemErrorModal(health);
      return;
    }

    // 2. エラーモーダルトリガー
    const errorTarget = (e.target as HTMLElement | null)?.closest(
      ".error-target",
    ) as HTMLElement | null;
    if (errorTarget) {
      const cardEl = errorTarget.closest(".card") as HTMLElement | null;
      const key = cardEl?.getAttribute("data-key");
      if (key && cardCache.has(key)) {
        void openErrorModal(cardCache.get(key)!);
      }
      return;
    }

    // 3. 履歴モーダルトリガー
    const historyTarget = (e.target as HTMLElement | null)?.closest(
      ".history-target",
    ) as HTMLElement | null;
    if (historyTarget) {
      const cardEl = historyTarget.closest(".card") as HTMLElement | null;
      const key = cardEl?.getAttribute("data-key");
      if (key && cardCache.has(key)) {
        void openHistoryModal(cardCache.get(key)!);
      }
      return;
    }

    // 4. チャット調査トリガー (カード右上の ✨ ボタン)
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

  // 完了ページ（/done）の判定
  const doneData = getDoneInitialData();
  if (doneData) {
    registerDoneCards(doneData.cards);
    if (doneData.health) {
      setLatestHealth(doneData.health);
      updateInfoModal(doneData.health);
    }
    window.addEventListener("autopilot:refresh", () => {
      window.location.reload();
    });
    return;
  }

  // メインページ（/）の初期化
  const initialData = getInitialState();
  if (initialData) {
    setLatestHealth(initialData.health);
    registerCards(initialData.lanes);
    updateInfoModal(initialData.health);
  }

  initLanes();
}

// ブラウザ環境でスクリプトが読み込まれたら自動実行
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initClient());
  } else {
    initClient();
  }
}
