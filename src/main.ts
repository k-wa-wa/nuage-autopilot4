import { cmdCancel } from "./cli/cancel.ts";
import { cmdDoctor } from "./cli/doctor.ts";
import { cmdRun } from "./cli/run.ts";
import { cmdStatus } from "./cli/status.ts";
import { cmdVersion } from "./cli/version.ts";
import { log } from "./log.ts";

const [, , cmd, ...rest] = process.argv;

// --config / -c を取り出す（config.ts の記載どおり AUTOPILOT_CONFIG より優先する）。
let configPath: string | undefined;
const args: string[] = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]!;
  if (a === "-c" || a === "--config") configPath = rest[++i];
  else if (a.startsWith("--config=")) configPath = a.slice("--config=".length);
  else args.push(a);
}

try {
  switch (cmd) {
    case "run":
      await cmdRun(configPath);
      break;
    case "doctor":
      await cmdDoctor(configPath);
      break;
    case "cancel":
      await cmdCancel(args[0], configPath);
      break;
    case "status":
      await cmdStatus(configPath);
      break;
    case "version":
    case "-v":
    case "--version":
      cmdVersion();
      break;
    default:
      usage();
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  // 常駐（run）の異常終了は標準ログの error として出す。単発コマンドは素の 1 行で十分。
  if (cmd === "run") log("error", msg);
  else console.error(`error: ${msg}`);
  process.exit(1);
}

function usage(): never {
  console.log(`autopilot

  run                      常駐（収集・判定・実行・Dashboard）。多重起動は不可
  status                   ターミナルで手番・自走中・キューを表示
  cancel <repo>#<issue>    該当アイテムのジョブを中止する
  doctor                   設定と接続性を起動前に検証する
  version                  バージョンとコミットハッシュを表示

  -c, --config <path>      設定ファイル（既定: $AUTOPILOT_CONFIG または $AUTOPILOT_HOME/config.yaml）

環境変数:
  GH_TOKEN                 bot アカウントのトークン（必須）
  AUTOPILOT_HOME           DB・ワークスペース・ログの置き場（既定: ~/.autopilot）`);
  process.exit(cmd ? 1 : 0);
}
