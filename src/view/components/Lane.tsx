import type { Card } from "../../api/state.ts";
import { cardKeyOf } from "../utils.ts";
import { CardView } from "./Card.tsx";

export interface LaneProps {
  title: string;
  cards: Card[];
  open?: boolean;
  emptyText?: string;
}

export function Lane({ title, cards, open = false, emptyText = "なし" }: LaneProps) {
  return (
    <section>
      <details open={open}>
        <summary>{title}</summary>
        <div>
          {cards.length === 0 ? (
            <div class="empty">{emptyText}</div>
          ) : (
            cards.map((c) => <CardView key={cardKeyOf(c)} card={c} />)
          )}
        </div>
      </details>
    </section>
  );
}
