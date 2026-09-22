/**
 * ローカル開発サーバー互換エクスポート。
 * 実装は src/view/dev/dev.tsx に集約されました。
 */
import { runFromCli } from "./dev/dev.tsx";

export * from "./dev/dev.tsx";

if (import.meta.main) {
  runFromCli();
}
