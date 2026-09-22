import { type IssueDraft, IssueDraftCard, parseIssueDraft } from "./IssueDraftCard.tsx";
import { renderBlocks } from "./markdownBlocks.tsx";

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "code"; code: string }
  | { kind: "draft"; draft: IssueDraft };

const BLOCK_PATTERN =
  /```[a-zA-Z0-9_-]*\n([\s\S]*?)```|<!-- ISSUE_DRAFT_START -->([\s\S]*?)<!-- ISSUE_DRAFT_END -->/g;

/** コードブロックと Issue ドラフトを切り出し、残りをテキスト片として返す。 */
export function splitSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(BLOCK_PATTERN)) {
    const start = m.index ?? 0;
    if (start > last) segments.push({ kind: "text", text: text.slice(last, start) });
    if (m[1] !== undefined) segments.push({ kind: "code", code: m[1].trim() });
    else segments.push({ kind: "draft", draft: parseIssueDraft(m[2] ?? "") });
    last = start + m[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

export function Markdown({ text }: { text: string }) {
  return (
    <>
      {splitSegments(text).map((seg, i) => {
        if (seg.kind === "code") {
          return (
            <pre key={i}>
              <code>{seg.code}</code>
            </pre>
          );
        }
        if (seg.kind === "draft") {
          return <IssueDraftCard key={i} draft={seg.draft} />;
        }
        return <div key={i}>{renderBlocks(seg.text)}</div>;
      })}
    </>
  );
}
