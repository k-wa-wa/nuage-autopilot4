import { renderBlocks } from "./markdownBlocks.tsx";

export type Segment = { kind: "text"; text: string } | { kind: "code"; code: string };

const CODE_BLOCK = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g;

/** コードブロックを切り出し、残りをテキスト片として返す。 */
export function splitSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(CODE_BLOCK)) {
    const start = m.index ?? 0;
    if (start > last) segments.push({ kind: "text", text: text.slice(last, start) });
    segments.push({ kind: "code", code: (m[1] ?? "").trim() });
    last = start + m[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

export function Markdown({ text }: { text: string }) {
  return (
    <>
      {splitSegments(text).map((seg, i) =>
        seg.kind === "code" ? (
          <pre key={i}>
            <code>{seg.code}</code>
          </pre>
        ) : (
          <div key={i}>{renderBlocks(seg.text)}</div>
        ),
      )}
    </>
  );
}
