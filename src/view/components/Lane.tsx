import type { FC } from "hono/jsx";
import type { Card } from "../state.ts";
import { CardComponent } from "./Card.tsx";

export interface LaneProps {
  id: string;
  title: string;
  cards?: Card[];
  open?: boolean;
}

export const LaneComponent: FC<LaneProps> = ({ id, title, cards, open = false }) => {
  return (
    <section>
      <details open={open}>
        <summary>{title}</summary>
        <div id={id}>
          {cards === undefined ? null : cards.length === 0 ? (
            <div class="empty">なし</div>
          ) : (
            cards.map((c) => <CardComponent key={`${c.repo}#${c.issue_number}`} card={c} />)
          )}
        </div>
      </details>
    </section>
  );
};
