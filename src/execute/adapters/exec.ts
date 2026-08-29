import type { AgentConfig } from "../../config.ts";
import type { AdapterOptions, AgentAdapter, Invocation } from "./types.ts";

export const execAdapter: AgentAdapter = {
  kind: "exec",
  buildInvocation(agent: AgentConfig, _o: AdapterOptions): Invocation {
    return {
      argv: [agent.command, ...(agent.args ?? [])],
      channel: "stdin",
    };
  },
};
