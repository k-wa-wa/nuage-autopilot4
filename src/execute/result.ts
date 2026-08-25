import { existsSync, readFileSync, rmSync } from "node:fs";
import type { AgentStatus, Verdict } from "../types.ts";

/**
 * 結果ファイル（spec.md §8）。
 *
 * 合否は GitHub のコメント本文を経由せず、ローカルの結果ファイルで受け渡す。
 * 往復もパースの曖昧さも無い。GitHub 側への投稿は人間が読むための説明に徹する。
 */

export interface AgentResult {
  status: AgentStatus;
  verdict?: Verdict;
  summary: string;
  next_context: string;
}

export type ReadResult =
  | { ok: true; value: AgentResult }
  | { ok: false; reason: string };

export function resultPath(runDir: string, jobId: number): string {
  return `${runDir}/${jobId}.result.json`;
}

export function promptPath(runDir: string, jobId: number): string {
  return `${runDir}/${jobId}.prompt.md`;
}

/** ファイルが無い・不正・必須欠けは exit 0 でも失敗として扱う。 */
export function readResult(path: string, requireVerdict: boolean): ReadResult {
  if (!existsSync(path)) return { ok: false, reason: "result file not found" };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return { ok: false, reason: `result file is not valid JSON: ${String(e)}` };
  }
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "result is not an object" };

  const o = raw as Record<string, unknown>;
  const status = o.status;
  if (status !== "ok" && status !== "blocked") return { ok: false, reason: `bad status: ${String(status)}` };

  const summary = typeof o.summary === "string" ? o.summary : "";
  if (summary.trim() === "") return { ok: false, reason: "summary is required" };

  const verdict = o.verdict;
  if (requireVerdict && status === "ok") {
    if (verdict !== "merge_ready" && verdict !== "needs_work") {
      return { ok: false, reason: `bad verdict: ${String(verdict)}` };
    }
  }

  const next = typeof o.next_context === "string" ? o.next_context : "";
  if ((verdict === "needs_work" || status === "blocked") && next.trim() === "") {
    return { ok: false, reason: "next_context is required for needs_work / blocked" };
  }

  return {
    ok: true,
    value: {
      status,
      ...(verdict === "merge_ready" || verdict === "needs_work" ? { verdict } : {}),
      summary,
      next_context: next,
    },
  };
}

export function cleanup(...paths: string[]): void {
  for (const p of paths) {
    try { rmSync(p, { force: true }); } catch { /* noop */ }
  }
}
