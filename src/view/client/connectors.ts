/**
 * カード間の親子関係を示す SVG コネクタ線（ベジェ曲線）の描画ロジック
 */

let activeHoverCard: HTMLElement | null = null;

export function getActiveHoverCard(): HTMLElement | null {
  return activeHoverCard;
}

export function setActiveHoverCard(card: HTMLElement | null): void {
  activeHoverCard = card;
}

export function clearRelationConnectors(): void {
  const layer = document.getElementById("relation-connector-layer");
  if (layer) layer.innerHTML = "";
}

export function drawRelationConnectors(targetCard: HTMLElement): void {
  const svg = document.getElementById("relation-connector-canvas") as SVGSVGElement | null;
  const layer = document.getElementById("relation-connector-layer");
  if (!svg || !layer) return;

  const currentKey = targetCard.getAttribute("data-key");
  const parentKey = targetCard.getAttribute("data-parent-key");
  if (!currentKey) {
    layer.innerHTML = "";
    return;
  }

  const relatedPairs: Array<{ fromEl: HTMLElement; toEl: HTMLElement }> = [];

  // 1. 自分が子で、親が存在する場合: 親 -> 自分
  if (parentKey) {
    const parentEl = document.querySelector<HTMLElement>(`[data-key="${parentKey}"]`);
    if (parentEl) {
      relatedPairs.push({ fromEl: parentEl, toEl: targetCard });
    }
  }

  // 2. 自分が親で、自分を親と指している子たちが存在する場合: 自分 -> 子たち
  const childEls = document.querySelectorAll<HTMLElement>(`[data-parent-key="${currentKey}"]`);
  for (const childEl of childEls) {
    relatedPairs.push({ fromEl: targetCard, toEl: childEl });
  }

  if (relatedPairs.length === 0) {
    layer.innerHTML = "";
    return;
  }

  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
  const docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
  svg.style.width = `${docW}px`;
  svg.style.height = `${docH}px`;

  let svgInner = "";

  for (const pair of relatedPairs) {
    const fromRect = pair.fromEl.getBoundingClientRect();
    const toRect = pair.toEl.getBoundingClientRect();

    let x1 = 0;
    let y1 = 0;
    let x2 = 0;
    let y2 = 0;
    let cx1 = 0;
    let cy1 = 0;
    let cx2 = 0;
    let cy2 = 0;

    // 左右にレーンが分かれている場合
    if (Math.abs(fromRect.left - toRect.left) > 100) {
      const isFromLeft = fromRect.left < toRect.left;
      if (isFromLeft) {
        x1 = fromRect.right + scrollX;
        y1 = fromRect.top + fromRect.height / 2 + scrollY;
        x2 = toRect.left + scrollX;
        y2 = toRect.top + toRect.height / 2 + scrollY;
      } else {
        x1 = fromRect.left + scrollX;
        y1 = fromRect.top + fromRect.height / 2 + scrollY;
        x2 = toRect.right + scrollX;
        y2 = toRect.top + toRect.height / 2 + scrollY;
      }
      const dx = Math.abs(x2 - x1) * 0.45;
      cx1 = isFromLeft ? x1 + dx : x1 - dx;
      cy1 = y1;
      cx2 = isFromLeft ? x2 - dx : x2 + dx;
      cy2 = y2;
    } else {
      // 同一レーン内の縦並びの場合
      const isFromTop = fromRect.top < toRect.top;
      if (isFromTop) {
        x1 = fromRect.left + fromRect.width / 2 + scrollX;
        y1 = fromRect.bottom + scrollY;
        x2 = toRect.left + toRect.width / 2 + scrollX;
        y2 = toRect.top + scrollY;
      } else {
        x1 = fromRect.left + fromRect.width / 2 + scrollX;
        y1 = fromRect.top + scrollY;
        x2 = toRect.left + toRect.width / 2 + scrollX;
        y2 = toRect.bottom + scrollY;
      }
      const dy = Math.abs(y2 - y1) * 0.45;
      cx1 = x1;
      cy1 = isFromTop ? y1 + dy : y1 - dy;
      cx2 = x2;
      cy2 = isFromTop ? y2 - dy : y2 + dy;
    }

    svgInner += `<path class="relation-path" d="M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}" />`;
    svgInner += `<circle class="relation-dot" cx="${x1}" cy="${y1}" r="3.5" />`;
    svgInner += `<circle class="relation-dot" cx="${x2}" cy="${y2}" r="3.5" />`;
  }

  layer.innerHTML = svgInner;
}

export function initConnectors(): void {
  document.addEventListener("mouseover", (e) => {
    const target = (e.target as HTMLElement | null)?.closest(".card") as HTMLElement | null;
    if (target && target !== activeHoverCard) {
      activeHoverCard = target;
      drawRelationConnectors(target);
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      if (activeHoverCard) {
        drawRelationConnectors(activeHoverCard);
      }
    },
    { passive: true },
  );

  window.addEventListener("resize", () => {
    if (activeHoverCard) {
      drawRelationConnectors(activeHoverCard);
    }
  });
}
