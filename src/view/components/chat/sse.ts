export interface SseEvent {
  event: string;
  data: unknown;
}

/**
 * text/event-stream のチャンクを受け取り、完結したイベントを返すパーサ。
 * チャンク境界で行や event/data の組が分断されても状態を持ち越す。
 */
export function createSseParser(): (chunk: string) => SseEvent[] {
  let buffer = "";
  let currentEvent = "message";

  return (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    const events: SseEvent[] = [];
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, "");
      if (line === "") {
        currentEvent = "message";
      } else if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const dataStr = line.slice(5).trim();
        if (!dataStr) continue;
        try {
          events.push({ event: currentEvent, data: JSON.parse(dataStr) });
        } catch {
          // 壊れた data 行は読み飛ばす
        }
      }
    }
    return events;
  };
}
