/**
 * Runner roteirizado: simula o agent chamando tools embrulhadas e respondendo texto, sem LLM.
 * Simula também o human-in-the-loop do Mastra: se uma tool chama `suspend`, o runner devolve `suspended`
 * e guarda a chamada; na retomada (`p.resume`) reexecuta a tool com `resumeData`/`suspendPayload`
 * antes de chamar o script, como o Mastra faz com o snapshot da run.
 */
import type { AgentRunner, AgentRunParams } from "@/engine/agent/types";

export interface Script {
  (p: AgentRunParams, tool: (id: string, input?: Record<string, unknown>) => Promise<unknown>): Promise<string> | string;
}

interface StoredRun { toolId: string; input: Record<string, unknown>; suspendPayload: unknown }

/** Runs suspensas do processo de teste (equivale ao storage do Mastra). */
const runs = new Map<string, StoredRun>();
let seq = 0;

export function scriptedRunner(script: Script, calls: AgentRunParams[] = []): AgentRunner {
  return async (p) => {
    calls.push(p);
    let suspension: { toolId: string; input: Record<string, unknown>; payload: unknown } | undefined;
    const run = async (id: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
      const t = p.tools[id];
      if (!t?.execute) throw new Error(`tool ${id} não disponível`);
      const suspend = async (payload: unknown) => { suspension = { toolId: id, input, payload }; };
      // Como no Mastra 1.x, as primitivas de HITL chegam em `context.agent`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return t.execute(input, { requestContext: p.requestContext, agent: { agentId: p.config.id, toolCallId: "call", suspend, ...extra } } as any);
    };
    if (p.resume) {
      const stored = runs.get(p.resume.runId);
      if (!stored) throw new Error(`run ${p.resume.runId} não encontrada`);
      runs.delete(p.resume.runId);
      await run(stored.toolId, stored.input, { resumeData: p.resume.data, suspendPayload: stored.suspendPayload });
    }
    const tool = (id: string, input: Record<string, unknown> = {}) => run(id, input);
    // Como no Mastra, a run termina na suspensão: texto que o roteiro devolveria depois dela não existe.
    const text = suspension ? "" : await script(p, tool);
    const final = suspension ? "" : text;
    if (final) p.onTextDelta(final);
    const base = { text: final, model: "mock-model", usage: { inputTokens: 100, outputTokens: 20 } };
    if (!suspension) return base;
    const s = suspension as { toolId: string; input: Record<string, unknown>; payload: unknown };
    seq += 1;
    const runId = `run-${seq}`;
    runs.set(runId, { toolId: s.toolId, input: s.input, suspendPayload: s.payload });
    return { ...base, finishReason: "suspended", suspended: { runId, toolCallId: `call-${seq}`, toolId: s.toolId, payload: s.payload } };
  };
}
