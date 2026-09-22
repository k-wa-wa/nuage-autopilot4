import type { DoneResponse, Health, StateResponse } from "../api/state.ts";

export interface DevScenario {
  name: string;
  title: string;
}

export interface DevOptions {
  scenarios: DevScenario[];
  current: string;
}

/** SSR とハイドレーションで同じ props を使うため、サーバーが HTML に埋め込みクライアントが読み戻す。 */
export type PageData =
  | { page: "dashboard"; state: StateResponse; dev?: DevOptions }
  | { page: "done"; done: DoneResponse; health: Health; dev?: DevOptions };

export const PAGE_DATA_ELEMENT_ID = "autopilot-page-data";
export const APP_ROOT_ELEMENT_ID = "app";
