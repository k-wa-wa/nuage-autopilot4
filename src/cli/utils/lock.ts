import { openSync, closeSync, writeSync, readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * 多重起動の防止（spec.md §7）。
 *
 * 孤児回収は「他にワーカーが存在しない」ことを前提とするため、これが無いと
 * 稼働中の別プロセスのジョブを横取りして二重実行する。
 *
 * Bun / Node に flock(2) は無いので O_EXCL のロックファイルで代替し、
 * 残骸で永久に起動できなくならないよう PID の生存確認で奪えるようにする。
 */

export interface Lock {
  release: () => void;
}

export function acquireLock(path: string, bootId: string): Lock | { heldBy: number } {
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, "wx", 0o644);
      writeSync(fd, `${process.pid}\n${bootId}\n`);
      closeSync(fd);
      return {
        release: () => {
          try { unlinkSync(path); } catch { /* noop */ }
        },
      };
    } catch {
      if (!existsSync(path)) continue;
      const pid = Number(readFileSync(path, "utf8").split("\n")[0]);
      if (Number.isFinite(pid) && alive(pid)) return { heldBy: pid };
      // 残骸。前回プロセスは死んでいるので奪う。
      try { unlinkSync(path); } catch { /* noop */ }
    }
  }
  return { heldBy: -1 };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
