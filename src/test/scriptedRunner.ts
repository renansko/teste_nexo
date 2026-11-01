/** Runner roteirizado: simula o agent chamando tools embrulhadas e respondendo texto, sem LLM. */
import type { AgentRunner, AgentRunParams } from "@/engine/agent/types";

export interface Script {
  (p: AgentRunParams, tool: (id: string, input?: Record<string, unknown>) => Promise<unknown>): Promise<string> | string;
}

export function scriptedRunner(script: Script, calls: AgentRunParams[] = []): AgentRunner {
  return async (p) => {
    calls.push(p);
    const tool = async (id: string, input: Record<string, unknown> = {}) => {
      const t = p.tools[id];
      if (!t?.execute) throw new Error(`tool ${id} não disponível`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return t.execute(input, { requestContext: p.requestContext } as any);
    };
    const text = await script(p, tool);
    if (text) p.onTextDelta(text);
    return { text, model: "mock-model", usage: { inputTokens: 100, outputTokens: 20 } };
  };
}
