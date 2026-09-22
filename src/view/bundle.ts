import { existsSync } from "node:fs";
import { join } from "node:path";
import { bundleClientMacro } from "./macro.ts" with { type: "macro" };

// 単一バイナリコンパイル時にマクロとして評価・埋め込まれる静的バンドル
const compiledBundle: string = bundleClientMacro();

/**
 * クライアント側スクリプト（src/view/client.tsx）の JS バンドル文字列を取得する。
 *
 * - ローカル開発 / ソースコード実行時: `src/view/client.tsx` が存在すれば Bun.build でインメモリビルド。
 * - 単一バイナリ配布時: コンパイル時にマクロ埋め込みされた compiledBundle を返却。
 */
export async function getClientBundle(): Promise<string> {
  const entryPath = join(import.meta.dir, "client.tsx");
  if (existsSync(entryPath)) {
    try {
      const buildResult = await Bun.build({
        entrypoints: [entryPath],
        target: "browser",
        minify: false,
      });
      if (buildResult.success && buildResult.outputs[0]) {
        return await buildResult.outputs[0].text();
      }
    } catch {
      // インメモリビルド失敗時はコンパイル済みバンドルへフォールバック
    }
  }

  return compiledBundle;
}
