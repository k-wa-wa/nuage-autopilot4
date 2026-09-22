import { renderToString } from "preact-render-to-string";
import { App } from "./App.tsx";
import { APP_ROOT_ELEMENT_ID, PAGE_DATA_ELEMENT_ID, type PageData } from "./pageData.ts";
import { styles } from "./styles/index.ts";

// </script> や <!-- を含むタイトルで script 要素が途中で閉じられないようにする
function serializeForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/**
 * ページ全体を SSR する。`#app` の中身はクライアントが同じ PageData でハイドレートする。
 */
export function renderDocument(data: PageData, options: { extraStyles?: string } = {}): string {
  const title = data.page === "done" ? "Autopilot - 完了" : "Autopilot";
  const html = renderToString(
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: styles + (options.extraStyles ?? "") }} />
      </head>
      <body>
        <div
          id={APP_ROOT_ELEMENT_ID}
          dangerouslySetInnerHTML={{ __html: renderToString(<App data={data} />) }}
        />
        <script
          type="application/json"
          id={PAGE_DATA_ELEMENT_ID}
          dangerouslySetInnerHTML={{ __html: serializeForScript(data) }}
        />
        <script type="module" src="/client.js" />
      </body>
    </html>,
  );
  return `<!doctype html>${html}`;
}
