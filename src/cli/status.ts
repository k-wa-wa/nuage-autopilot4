import { loadConfig } from "../config.ts";
import { buildState } from "../view/state.ts";

export type StateData = ReturnType<typeof buildState>;

export function formatStatus(s: StateData): string {
  const lines: string[] = [];
  const formatLane = (title: string, cards: StateData["lanes"]["action_required"]) => {
    lines.push(`\n${title} (${cards.length})`);
    for (const c of cards) {
      const prInfo = c.pr_number > 0 ? ` (PR #${c.pr_number})` : "";
      lines.push(`  ${c.repo}#${c.issue_number}${prInfo}  ${c.display_hint.padEnd(18)} ${c.title}`);
    }
  };
  formatLane("🧑 Action Required", s.lanes.action_required);
  formatLane("🤖 Working", s.lanes.working);
  formatLane("📦 Queued", s.lanes.queued);
  if (s.health.degraded.length) {
    lines.push(`\n!  ${s.health.degraded.join(" / ")}`);
  }
  return lines.join("\n").trimStart();
}

export async function cmdStatus(configPath?: string): Promise<void> {
  const cfg = loadConfig(configPath);
  try {
    const res = await fetch(`http://127.0.0.1:${cfg.dashboard.port}/api/state`);
    const s = (await res.json()) as StateData;
    console.log(formatStatus(s));
  } catch {
    console.error("autopilot is not running");
    process.exit(1);
  }
}
