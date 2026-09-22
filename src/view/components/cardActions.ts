import { createContext } from "preact";
import type { Card } from "../../api/state.ts";

/** カードからページへ伝える操作。未指定の操作はカード側でボタンごと出さない。 */
export interface CardActions {
  openChat?: (card: Card) => void;
  openError?: (card: Card) => void;
  openHistory?: (card: Card) => void;
  hover?: (key: string | null) => void;
  registerElement?: (key: string, el: HTMLElement | null) => void;
  /** 親子関係のハイライト。ホバー中が active、線でつながる相手が target。 */
  relationOf?: (key: string) => "active" | "target" | null;
}

export const CardActionsContext = createContext<CardActions>({});
