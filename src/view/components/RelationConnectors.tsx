import { useEffect, useLayoutEffect, useState } from "preact/hooks";
import type { Card } from "../../api/state.ts";
import { cardKeyOf, parentKeyOf } from "../utils.ts";

interface Connector {
  key: string;
  d: string;
  from: [number, number];
  to: [number, number];
}

/** ホバー中カードと、その親・子カードの組（親 → 子の向き）。 */
export function relatedPairs(hoverKey: string, cards: Card[]): Array<[string, string]> {
  const hovered = cards.find((c) => cardKeyOf(c) === hoverKey);
  if (!hovered) return [];
  const pairs: Array<[string, string]> = [];
  const parentKey = parentKeyOf(hovered);
  if (parentKey) pairs.push([parentKey, hoverKey]);
  for (const c of cards) {
    if (parentKeyOf(c) === hoverKey) pairs.push([hoverKey, cardKeyOf(c)]);
  }
  return pairs;
}

// SVG は position: fixed なのでビューポート座標のまま描く
function bezier(fromEl: HTMLElement, toEl: HTMLElement): Connector {
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  let x1: number;
  let y1: number;
  let x2: number;
  let y2: number;
  let d: string;

  if (Math.abs(a.left - b.left) > 100) {
    // レーンが左右に分かれている: 横向きの S 字
    const fromLeft = a.left < b.left;
    x1 = fromLeft ? a.right : a.left;
    y1 = a.top + a.height / 2;
    x2 = fromLeft ? b.left : b.right;
    y2 = b.top + b.height / 2;
    const dx = Math.abs(x2 - x1) * 0.45 * (fromLeft ? 1 : -1);
    d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  } else {
    // 同一レーン内の縦並び
    const fromTop = a.top < b.top;
    x1 = a.left + a.width / 2;
    y1 = fromTop ? a.bottom : a.top;
    x2 = b.left + b.width / 2;
    y2 = fromTop ? b.top : b.bottom;
    const dy = Math.abs(y2 - y1) * 0.45 * (fromTop ? 1 : -1);
    d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
  }
  return { key: `${fromEl.dataset.key}->${toEl.dataset.key}`, d, from: [x1, y1], to: [x2, y2] };
}

export interface RelationConnectorsProps {
  hoverKey: string | null;
  cards: Card[];
  elements: Map<string, HTMLElement>;
}

export function RelationConnectors({ hoverKey, cards, elements }: RelationConnectorsProps) {
  const [connectors, setConnectors] = useState<Connector[]>([]);

  const measure = () => {
    if (!hoverKey) {
      setConnectors([]);
      return;
    }
    const next: Connector[] = [];
    for (const [fromKey, toKey] of relatedPairs(hoverKey, cards)) {
      const fromEl = elements.get(fromKey);
      const toEl = elements.get(toKey);
      if (fromEl && toEl) next.push(bezier(fromEl, toEl));
    }
    setConnectors(next);
  };

  // カード位置はレンダリング後にしか確定しないため、DOM 反映直後に測る
  useLayoutEffect(measure, [hoverKey, cards, elements]);

  // スクロールするのは window ではなくレーンのペインなので capture で拾う
  useEffect(() => {
    if (!hoverKey) return;
    document.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    return () => {
      document.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  });

  return (
    <svg class="relation-connector-svg" aria-hidden="true">
      {connectors.map((c) => (
        <g key={c.key}>
          <path class="relation-path" d={c.d} />
          <circle class="relation-dot" cx={c.from[0]} cy={c.from[1]} r="3.5" />
          <circle class="relation-dot" cx={c.to[0]} cy={c.to[1]} r="3.5" />
        </g>
      ))}
    </svg>
  );
}
