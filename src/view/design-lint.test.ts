/**
 * Design Token Lint Tests (方式A: Bun ネイティブ軽量チェッカー)
 *
 * docs/ui-design.md で定義したデザインシステム原則をコードで強制する。
 * 意図的な例外は CSS ファイル中の行末コメント「design-lint-ignore」で明示する。
 *
 * チェック項目:
 *   1. 生カラーコードの直書き禁止 (#hex, rgba 有色値)
 *   2. 未定義 CSS 変数の参照禁止
 *   3. 非許可スペーシング値（4px/8px グリッド外の px 値）
 *   4. 非許可フォントサイズ
 *   5. 非許可 border-radius
 *   6. @media (hover: hover) 外の :hover スタイル禁止
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const VIEW_DIR = import.meta.dir;
const GLOBAL_CSS = join(VIEW_DIR, "styles", "global.css");

// ---- CSS ファイル収集 ----

function getAllCssFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...getAllCssFiles(full));
    else if (entry.name.endsWith(".css")) files.push(full);
  }
  return files;
}

// ---- ユーティリティ ----

/** global.css から定義済みのCSSカスタムプロパティ名を全て取得する */
function getDefinedVars(cssPath: string): Set<string> {
  const content = readFileSync(cssPath, "utf-8");
  const vars = new Set<string>();
  for (const m of content.matchAll(/--([a-zA-Z0-9_-]+)\s*:/g)) {
    if (m[1]) vars.add(m[1]);
  }
  return vars;
}

interface CssLine {
  /** ファイル相対パス */
  file: string;
  lineNum: number;
  /** コメントを除いた行の内容 */
  content: string;
  /** design-lint-ignore コメントが付いているか */
  ignored: boolean;
}

/** CSS ファイルを行ごとに解析。// design-lint-ignore コメントを検出する */
function parseCssLines(cssPath: string): CssLine[] {
  const rel = cssPath.replace(`${VIEW_DIR}/`, "");
  const raw = readFileSync(cssPath, "utf-8").split("\n");
  return raw.map((line, i) => ({
    file: rel,
    lineNum: i + 1,
    content: line.replace(/\/\*(?!.*design-lint-ignore).*?\*\//g, " ").trim(),
    ignored: line.includes("design-lint-ignore"),
  }));
}

/**
 * @keyframes やコメントブロック内かどうかを考慮した
 * 「@media (hover: hover) ブロック内かどうか」トラッカー
 */
// buildHoverMediaTracker は利用せず design-lint.test.ts 内に直接実装

// ---- ルール定義 ----

const ALLOWED_FONT_SIZES = new Set([
  "11px",
  "12px",
  "13px",
  "14px",
  "15px",
  "16px", // iOS Safari 自動ズーム防止用
  "18px",
  "20px",
  "22px",
  "inherit",
]);

const ALLOWED_RADII = new Set([
  "0",
  "4px",
  "6px",
  "8px",
  "12px",
  "16px",
  "9999px",
  "50%",
  "inherit",
]);

// ---- テスト本体 ----

const cssFiles = getAllCssFiles(VIEW_DIR);
const definedVars = getDefinedVars(GLOBAL_CSS);

describe("Design Token Lint (docs/ui-design.md 準拠)", () => {
  // ── 1. 生カラーコードの直書き禁止 ──────────────────────────────────────────
  test("CSS変数トークンを使用し、生の #hex カラーを global.css 以外に直書きしない", () => {
    const violations: string[] = [];
    for (const file of cssFiles) {
      if (file.endsWith("global.css")) continue;
      const lines = parseCssLines(file);
      for (const { content, file: rel, lineNum, ignored } of lines) {
        if (ignored) continue;
        const hexMatches = content.match(/#[0-9a-fA-F]{3,8}\b/g);
        if (hexMatches) {
          violations.push(`${rel}:${lineNum} → ${hexMatches.join(", ")}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  test("CSS変数トークンを使用し、有色の rgba/rgb を global.css 以外に直書きしない", () => {
    const violations: string[] = [];
    for (const file of cssFiles) {
      if (file.endsWith("global.css")) continue;
      const lines = parseCssLines(file);
      for (const { content, file: rel, lineNum, ignored } of lines) {
        if (ignored) continue;
        for (const m of content.matchAll(/(rgba?|hsla?)\(([^)]+)\)/g)) {
          const args = (m[2] ?? "").trim();
          // rgba(0, 0, 0, ...) はバックドロップ・シャドウ用の許容値
          if (args.startsWith("0, 0, 0") || args.startsWith("0,0,0")) continue;
          violations.push(`${rel}:${lineNum} → ${m[0]}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  // ── 2. 未定義 CSS 変数の参照禁止 ────────────────────────────────────────────
  test("var(--...) で参照する CSS 変数はすべて global.css で定義されている", () => {
    const violations: string[] = [];
    for (const file of cssFiles) {
      const lines = parseCssLines(file);
      for (const { content, file: rel, lineNum, ignored } of lines) {
        if (ignored) continue;
        for (const m of content.matchAll(/var\(--([a-zA-Z0-9_-]+)/g)) {
          if (!definedVars.has(m[1] ?? "")) {
            violations.push(`${rel}:${lineNum} → --${m[1]} が未定義`);
          }
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  // ── 3. スペーシング（4px/8pxグリッド）─────────────────────────────────────
  test("padding/margin/gap は 4px の倍数、または 0-2px の微小値に限定する", () => {
    const violations: string[] = [];
    for (const file of cssFiles) {
      const lines = parseCssLines(file);
      for (const { content, file: rel, lineNum, ignored } of lines) {
        if (ignored) continue;
        const m = content.match(
          /(padding|margin|gap|row-gap|column-gap)(?:-(?:top|bottom|left|right))?:\s*([^;]+)/,
        );
        if (!m) continue;
        const val = (m[2] ?? "").trim();
        const pxMatches = val.match(/-?\b\d+px\b/g);
        if (!pxMatches) continue;
        for (const px of pxMatches) {
          const num = Math.abs(parseInt(px, 10));
          // 0, 1, 2px はオフセット・ミクロ調整として許容
          if (num > 2 && num % 4 !== 0) {
            violations.push(`${rel}:${lineNum} → ${m[1]}: ${val}`);
            break;
          }
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  // ── 4. フォントサイズ階層 ───────────────────────────────────────────────────
  test("font-size は許可された階層値（11/12/13/14/15/16/18/20/22px, inherit）のみ使用する", () => {
    const violations: string[] = [];
    for (const file of cssFiles) {
      const lines = parseCssLines(file);
      for (const { content, file: rel, lineNum, ignored } of lines) {
        if (ignored) continue;
        const m = content.match(/font-size:\s*([^;]+)/);
        if (!m) continue;
        const val = (m[1] ?? "").trim();
        if (!ALLOWED_FONT_SIZES.has(val)) {
          violations.push(`${rel}:${lineNum} → font-size: ${val}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  // ── 5. border-radius 階層 ──────────────────────────────────────────────────
  test("border-radius は許可された階層値（0/4/6/8/12/16px, 9999px, 50%）のみ使用する", () => {
    const violations: string[] = [];
    for (const file of cssFiles) {
      const lines = parseCssLines(file);
      for (const { content, file: rel, lineNum, ignored } of lines) {
        if (ignored) continue;
        const m = content.match(/border-radius:\s*([^;]+)/);
        if (!m) continue;
        const val = (m[1] ?? "").trim();
        const parts = val.split(/\s+/);
        for (const p of parts) {
          if (!ALLOWED_RADII.has(p)) {
            violations.push(`${rel}:${lineNum} → border-radius: ${val}`);
            break;
          }
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  // ── 6. :hover は @media (hover: hover) 内に限定 ────────────────────────────
  test(":hover を使用するルールは @media (hover: hover) でラップする（タッチ残留防止）", () => {
    const violations: string[] = [];
    for (const file of cssFiles) {
      const rel = file.replace(`${VIEW_DIR}/`, "");
      const content = readFileSync(file, "utf-8");
      // コメントを除去（行番号保持のため改行を保持）
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
      const lines = noComments.split("\n");

      // @media (hover: hover) ブロックの行番号レンジを収集
      // 簡易実装: { ブロック開始/終了 } を追跡
      let depth = 0;
      let mediaStart: number | null = null;
      const hoverRanges: [number, number][] = []; // [startLine, endLine] (1-indexed)
      let selectorBuf = "";

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        for (let c = 0; c < line.length; c++) {
          const ch = line[c]!;
          if (ch === "{") {
            if (mediaStart === null && selectorBuf.match(/@media[^{]*\(hover:\s*hover\)/)) {
              mediaStart = i;
            }
            depth++;
            selectorBuf = "";
          } else if (ch === "}") {
            depth--;
            if (mediaStart !== null && depth === 0) {
              hoverRanges.push([mediaStart + 1, i + 1]);
              mediaStart = null;
            }
            selectorBuf = "";
          } else if (ch === ";") {
            selectorBuf = "";
          } else {
            selectorBuf += ch;
          }
        }
      }

      // 各行をスキャンし、:hover を含むセレクタが hoverRanges 外かを検査
      const origLines = readFileSync(file, "utf-8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const cleanedLine = lines[i];
        const origLine = origLines[i];
        if (!cleanedLine || !origLine) continue;

        // セレクタ行（{ を含む行）で :hover が使われているか検査
        if (cleanedLine.includes(":hover") && cleanedLine.includes("{")) {
          const lineNum = i + 1;
          const inHoverMedia = hoverRanges.some(([s, e]) => lineNum >= s && lineNum <= e);
          if (!inHoverMedia) {
            // design-lint-ignore のチェック:
            //   1. セレクタ行自体（Biome整形前のインラインコメント）
            //   2. セレクタ行の直後（Biome整形後: { の次行にコメントが移動する場合）
            const nextOrigLine = origLines[i + 1] ?? "";
            const hasIgnore =
              origLine.includes("design-lint-ignore") ||
              nextOrigLine.includes("design-lint-ignore");
            if (!hasIgnore) {
              violations.push(`${rel}:${lineNum} \u2192 ${cleanedLine.trim()}`);
            }
          }
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
