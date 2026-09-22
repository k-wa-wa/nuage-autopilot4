import { describe, expect, test } from "bun:test";
import { renderToString } from "preact-render-to-string";
import type { Card } from "../api/state.ts";
import { buildState } from "../api/state.ts";
import { splitSegments } from "./components/chat/Markdown.tsx";
import { renderBlocks } from "./components/chat/markdownBlocks.tsx";
import { createSseParser } from "./components/chat/sse.ts";
import { ErrorModal } from "./components/ErrorModal.tsx";
import { HistoryModal } from "./components/HistoryModal.tsx";
import { relatedPairs } from "./components/RelationConnectors.tsx";
import { createMockDb } from "./dev/mock.ts";
import { renderDocument } from "./document.tsx";
import { PAGE_DATA_ELEMENT_ID, type PageData } from "./pageData.ts";

function card(overrides: Partial<Card>): Card {
  return {
    repo: "o/r",
    issue_number: 1,
    pr_number: 0,
    title: "title",
    display_hint: "実装中",
    url: "https://github.com/o/r/issues/1",
    issue_url: "https://github.com/o/r/issues/1",
    pr_url: null,
    state_since: "2026-01-01T00:00:00Z",
    queue_position: null,
    job_type: null,
    started_at: null,
    ...overrides,
  };
}

describe("createSseParser", () => {
  test("チャンク境界で分断された event / data を組み立てる", () => {
    const parse = createSseParser();
    expect(parse('event: text\ndata: {"del')).toEqual([]);
    expect(parse('ta":"a"}\n\nevent: done\n')).toEqual([{ event: "text", data: { delta: "a" } }]);
    expect(parse('data: {"conversation_id":"c1"}\n\n')).toEqual([
      { event: "done", data: { conversation_id: "c1" } },
    ]);
  });

  test("空行でイベント名がリセットされ、壊れた JSON は読み飛ばす", () => {
    const parse = createSseParser();
    expect(parse("event: error\ndata: {broken\n\ndata: {}\n")).toEqual([
      { event: "message", data: {} },
    ]);
  });
});

describe("Markdown", () => {
  test("コードブロックと Issue ドラフトを切り出す", () => {
    const text = [
      "前置き",
      "```ts",
      "const a = 1;",
      "```",
      "<!-- ISSUE_DRAFT_START -->",
      "**タイトル**: 新機能",
      "**対象リポジトリ**: o/r",
      "### 背景",
      "- [ ] やること",
      "<!-- ISSUE_DRAFT_END -->",
      "後書き",
    ].join("\n");
    const segs = splitSegments(text);
    expect(segs.map((s) => s.kind)).toEqual(["text", "code", "text", "draft", "text"]);
    expect(segs[1]).toEqual({ kind: "code", code: "const a = 1;" });
    expect(segs[3]).toEqual({
      kind: "draft",
      draft: { repo: "o/r", title: "新機能", body: "### 背景\n- [ ] やること" },
    });
  });

  test("HTML を解釈せずテキストとして描画する", () => {
    const html = renderToString(
      <div>{renderBlocks('<img src=x onerror="alert(1)"> **太字**')}</div>,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("<strong>太字</strong>");
  });

  test("箇条書きとチェックボックスを ul にまとめる", () => {
    const html = renderToString(<div>{renderBlocks("- a\n- [x] b\n\n## 見出し")}</div>);
    expect(html).toContain("<ul><li>a</li>");
    expect(html).toContain('class="md-task-box checked"');
    expect(html).toContain("<h3>見出し</h3>");
  });
});

describe("relatedPairs", () => {
  const parent = card({ issue_number: 10, sub_issues_total: 2 });
  const child = card({ issue_number: 11, parent_issue_number: 10 });
  const other = card({ issue_number: 12 });

  test("親をホバーすると子へ、子をホバーすると親から線を引く", () => {
    expect(relatedPairs("o/r#10", [parent, child, other])).toEqual([["o/r#10", "o/r#11"]]);
    expect(relatedPairs("o/r#11", [parent, child, other])).toEqual([["o/r#10", "o/r#11"]]);
    expect(relatedPairs("o/r#12", [parent, child, other])).toEqual([]);
  });
});

describe("モーダル", () => {
  test("履歴モーダルはタイトル・バッジ・Issue/PR リンク・タイムラインを出す", () => {
    const c = card({
      title: "履歴のあるカード",
      pr_number: 7,
      pr_url: "https://github.com/o/r/pull/7",
      job_history: [
        {
          id: 1,
          job_id: 1,
          job_type: "implement",
          started_at: "2026-01-01T00:00:00Z",
          ended_at: null,
          duration_sec: 90,
          result: "SUCCESS",
          summary: "実装した",
        },
      ],
    });
    const html = renderToString(<HistoryModal card={c} onClose={() => {}} />);
    expect(html).toContain("⏱️ ジョブ実行履歴 (o/r#1)");
    expect(html).toContain("履歴のあるカード");
    expect(html).toContain("PR #7");
    expect(html).toContain("計 1 回実行");
    expect(html).toContain('href="https://github.com/o/r/issues/1"');
    expect(html).toContain('href="https://github.com/o/r/pull/7"');
    expect(html).toContain("1分30秒");
    expect(html).toContain("実装した");
  });

  test("エラーモーダルは履歴が 2 件以上のときだけ過去履歴を出す", () => {
    const err = { job_type: "implement", result: "FAIL", summary: "落ちた", occurred_at: null };
    const one = renderToString(
      <ErrorModal card={card({ error_detail: err, error_history: [err] })} onClose={() => {}} />,
    );
    expect(one).toContain("落ちた");
    expect(one).not.toContain("過去のエラー履歴");
    const two = renderToString(
      <ErrorModal
        card={card({ error_detail: err, error_history: [err, err] })}
        onClose={() => {}}
      />,
    );
    expect(two).toContain("過去のエラー履歴 (2件)");
  });
});

describe("renderDocument", () => {
  test("埋め込みデータ中の </script> で script 要素が閉じられない", () => {
    const { db } = createMockDb("standard");
    const state = buildState(db);
    const first = state.lanes.action_required[0]!;
    first.title = "</script><script>alert(1)</script>";
    const html = renderDocument({ page: "dashboard", state });

    expect(html).not.toContain("</script><script>alert(1)");
    const json = html.split(`id="${PAGE_DATA_ELEMENT_ID}">`)[1]!.split("</script>")[0]!;
    const data = JSON.parse(json) as Extract<PageData, { page: "dashboard" }>;
    expect(data.state.lanes.action_required[0]!.title).toBe(first.title);
  });
});
