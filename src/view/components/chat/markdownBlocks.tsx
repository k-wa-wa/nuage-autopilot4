import type { ComponentChildren, VNode } from "preact";

function renderInline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    if (m[1] !== undefined) out.push(<strong>{m[1]}</strong>);
    else out.push(<code>{m[2]}</code>);
    last = start + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const HEADING = /^#{2,4}\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const LIST_ITEM = /^\s*[-*]\s+(.*)$/;
const CHECKBOX = /^\[([ xX])\]\s+(.*)$/;

function ListItem({ text }: { text: string }) {
  const check = text.match(CHECKBOX);
  if (!check) return <li>{renderInline(text)}</li>;
  const checked = check[1] !== " ";
  return (
    <li class="md-task">
      <span class={checked ? "md-task-box checked" : "md-task-box"}>{checked ? "☑" : "☐"}</span>
      {renderInline(check[2] ?? "")}
    </li>
  );
}

/** 見出し・引用・箇条書き・段落だけを扱う軽量 Markdown レンダラ。 */
export function renderBlocks(text: string): VNode[] {
  const blocks: VNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push(<p>{renderInline(paragraph.join("\n"))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul>
          {list.map((item, i) => (
            <ListItem key={i} text={item} />
          ))}
        </ul>,
      );
    }
    list = [];
  };

  for (const line of text.split("\n")) {
    const heading = line.match(HEADING);
    const quote = line.match(QUOTE);
    const item = line.match(LIST_ITEM);
    if (item) {
      flushParagraph();
      list.push(item[1] ?? "");
      continue;
    }
    flushList();
    if (heading) {
      flushParagraph();
      blocks.push(<h3>{renderInline(heading[1] ?? "")}</h3>);
    } else if (quote) {
      flushParagraph();
      blocks.push(<blockquote>{renderInline(quote[1] ?? "")}</blockquote>);
    } else if (line.trim() === "") {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
