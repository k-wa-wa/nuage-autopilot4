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
/** 先頭/末尾の `|` は必須にしない（モデルの出力揺れに対応）。区切り行との組み合わせで表として確定させる。 */
const TABLE_LINE = (line: string): boolean => line.includes("|") && line.trim() !== "";
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

function Table({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <table class="md-table">
      <thead>
        <tr>
          {header.map((h, i) => (
            <th key={i}>{renderInline(h)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{renderInline(c)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

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

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // テーブル: 現在行がセル行で、次行が区切り行（|---|---|）のときだけ表として確定させる
    if (TABLE_LINE(line) && TABLE_SEPARATOR.test(lines[i + 1] ?? "")) {
      flushParagraph();
      flushList();
      const header = splitTableRow(line);
      i += 2; // ヘッダー行と区切り行を消費
      const rows: string[][] = [];
      while (i < lines.length && TABLE_LINE(lines[i] ?? "")) {
        rows.push(splitTableRow(lines[i] ?? ""));
        i++;
      }
      i--; // for の i++ と相殺
      blocks.push(<Table key={blocks.length} header={header} rows={rows} />);
      continue;
    }

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
