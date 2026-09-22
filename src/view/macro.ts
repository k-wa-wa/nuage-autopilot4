import { join } from "node:path";

/**
 * ビルド時マクロ用ヘルパー。
 * `bun build --compile` 実行時にコンパイルプロセス内で実行され、
 * クライアント側スクリプトをバンドルした結果の文字列を返す。
 */
export function bundleClientMacro(): string {
  const entry = join(import.meta.dir, "client/main.ts");
  const proc = Bun.spawnSync(["bun", "build", entry, "--target=browser"]);
  if (!proc.success) {
    throw new Error(`Failed to bundle client script at compile-time: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString();
}
