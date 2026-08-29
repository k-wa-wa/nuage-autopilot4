import type { AgentConfig } from "../../config.ts";
import type { AdapterOptions, AgentAdapter, Invocation } from "./types.ts";

export const claudeAdapter: AgentAdapter = {
  kind: "claude",
  buildInvocation(agent: AgentConfig, o: AdapterOptions): Invocation {
    const argv = [agent.command, "-p"];
    if (o.elevated) argv.push("--permission-mode", "bypassPermissions");
    if (agent.model) argv.push("--model", agent.model);
    return { argv, channel: "stdin" };
  },
};
