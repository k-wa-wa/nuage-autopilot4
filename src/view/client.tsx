import { hydrate } from "preact";
import { App } from "./App.tsx";
import { APP_ROOT_ELEMENT_ID, PAGE_DATA_ELEMENT_ID, type PageData } from "./pageData.ts";

// ブラウザ用エントリ。サーバーが SSR に使ったのと同じ PageData でハイドレートする。
const root = document.getElementById(APP_ROOT_ELEMENT_ID);
const dataEl = document.getElementById(PAGE_DATA_ELEMENT_ID);
if (root && dataEl?.textContent) {
  const data = JSON.parse(dataEl.textContent) as PageData;
  hydrate(<App data={data} />, root);
}
