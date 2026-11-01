/**
 * Acesso uniforme às primitivas de human-in-the-loop dentro de uma tool.
 * No Mastra 1.x elas chegam em `context.agent` (`suspend`, `resumeData`, `suspendPayload`); fora de uma run
 * (runner roteirizado dos testes) o engine coloca as mesmas chaves no nível raiz do contexto.
 * @wiki docs/brain/services/HumanInTheLoop.md
 */
import type { ToolExecutionContext } from "@mastra/core/tools";

export interface HitlContext<TSuspend, TResume> {
  /** Suspende a run com a pergunta; a tool deve dar `return` logo depois. Ausente fora de uma run. */
  suspend?: (payload: TSuspend) => Promise<void>;
  /** Resposta do funcionário (só na retomada). */
  resumeData?: TResume;
  /** Payload com que a tool suspendeu (só na retomada). */
  suspendPayload?: TSuspend;
}

type AnyContext = Pick<ToolExecutionContext<any, any>, "agent" | "suspend" | "resumeData" | "suspendPayload">;

export function hitl<TSuspend, TResume>(context: AnyContext): HitlContext<TSuspend, TResume> {
  const source = (context.agent ?? context) as { suspend?: (p: TSuspend) => Promise<void>; resumeData?: TResume; suspendPayload?: TSuspend };
  return { suspend: source.suspend?.bind(source), resumeData: source.resumeData, suspendPayload: source.suspendPayload };
}

/** Devolve um contexto igual ao recebido, mas com `suspend` observado (nos dois lugares em que ele pode estar). */
export function observeSuspend<TContext extends AnyContext>(context: TContext, onSuspend: (payload: unknown) => void): TContext {
  const wrap = (original?: (p: unknown, o?: unknown) => Promise<unknown>) =>
    async (payload: unknown, options?: unknown) => {
      onSuspend(payload);
      return original ? original(payload, options) : undefined;
    };
  const agent = context.agent as (Record<string, unknown> & { suspend?: (p: unknown, o?: unknown) => Promise<unknown> }) | undefined;
  return {
    ...context,
    suspend: wrap(context.suspend as ((p: unknown, o?: unknown) => Promise<unknown>) | undefined),
    ...(agent ? { agent: { ...agent, suspend: wrap(agent.suspend ? agent.suspend.bind(agent) : undefined) } } : {}),
  };
}
