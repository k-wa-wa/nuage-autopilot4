/**
 * ターミナル用 ANSI カラー出力ユーティリティ。
 * NO_COLOR や非 TTY 環境では自動的にエスケープコードを無効化する。
 */

function isColorSupported(): boolean {
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== "") return false;
  if (process.env.FORCE_COLOR === "1" || process.env.FORCE_COLOR === "true") return true;
  return Boolean(process.stdout.isTTY);
}

const colorEnabled = isColorSupported();

function wrap(open: string, close: string): (text: string) => string {
  return (text: string) => (colorEnabled ? `${open}${text}${close}` : text);
}

export const c = {
  bold: wrap("\x1b[1m", "\x1b[22m"),
  dim: wrap("\x1b[2m", "\x1b[22m"),
  underline: wrap("\x1b[4m", "\x1b[24m"),

  black: wrap("\x1b[30m", "\x1b[39m"),
  red: wrap("\x1b[31m", "\x1b[39m"),
  green: wrap("\x1b[32m", "\x1b[39m"),
  yellow: wrap("\x1b[33m", "\x1b[39m"),
  blue: wrap("\x1b[34m", "\x1b[39m"),
  magenta: wrap("\x1b[35m", "\x1b[39m"),
  cyan: wrap("\x1b[36m", "\x1b[39m"),
  white: wrap("\x1b[37m", "\x1b[39m"),
  gray: wrap("\x1b[90m", "\x1b[39m"),

  bgRed: wrap("\x1b[41m", "\x1b[49m"),
  bgGreen: wrap("\x1b[42m", "\x1b[49m"),
  bgYellow: wrap("\x1b[43m", "\x1b[49m"),

  // 複合スタイル
  boldGreen: (text: string) => c.bold(c.green(text)),
  boldYellow: (text: string) => c.bold(c.yellow(text)),
  boldRed: (text: string) => c.bold(c.red(text)),
  boldCyan: (text: string) => c.bold(c.cyan(text)),
};
