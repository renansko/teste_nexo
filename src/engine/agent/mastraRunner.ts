/**
 * Runner baseado em Mastra. Cria o Agent por turno (barato) com as tools já embrulhadas,
 * instruções estáveis em `instructions` (cache de prompt automático no provedor) e contexto volátil em `system`.
 * O modelo é a string `provedor/modelo` de `NEXO_MODEL`: o model router do Mastra resolve o provedor e a chave.
 * O Agent é registrado na instância Mastra do processo para que uma run suspensa (tool HITL) possa ser
 * retomada em outra requisição com `resumeStream`.
 * @wiki docs/brain/services/AssistantConfig.md
 * @wiki docs/brain/services/HumanInTheLoop.md
 */
import { Agent } from "@mastra/core/agent";
import { AppError } from "@/lib/errors";
import { getMastra } from "./mastra";
import type { AgentRunner, AgentSuspension } from "./types";

type ModelConfig = ConstructorParameters<typeof Agent>[0]["model"];

export const AGENT_ERROR_MESSAGE = "Não consegui consultar o assistente agora. Tente novamente em instantes.";
/** A run suspensa não existe mais (ou a tool não está mais suspensa): a pergunta precisa ser descartada. */
export const RESUME_GONE = "RESUME_GONE";

/** Detalhe técnico vai para o log do servidor; o cliente recebe mensagem genérica (sem vazar provedor/chaves). */
export function agentError(cause: unknown): AppError {
  const detail = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : JSON.stringify(cause);
  console.error("[agent] falha ao consultar o modelo:", detail);
  return new AppError("AGENT_ERROR", AGENT_ERROR_MESSAGE, 502);
}

/** Erros do Mastra ao retomar sem snapshot/tool suspensa têm id `AGENT_RESUME_*`. */
function isResumeGone(cause: unknown): boolean {
  const id = (cause as { id?: unknown } | null)?.id;
  return typeof id === "string" && (id === "AGENT_RESUME_NO_SNAPSHOT_FOUND" || id === "AGENT_RESUME_TOOL_CALL_NOT_SUSPENDED");
}

/** `opts.model` troca a resolução do modelo (testes injetam um modelo simulado); por padrão a string vai direto ao router. */
export function createMastraRunner(opts: { model?: (id: string) => ModelConfig } = {}): AgentRunner {
  const resolveModel = opts.model ?? ((id: string) => id as ModelConfig);
  return async ({ config, tools, messages, system, requestContext, onTextDelta, resume }) => {
    const agent = new Agent({
      id: config.id,
      name: config.name,
      instructions: config.instructions,
      model: resolveModel(config.model),
      tools,
    });
    agent.__registerMastra(getMastra());

    const options = { requestContext, maxSteps: config.limits.maxSteps, ...(system ? { system } : {}) };
    const stream = resume
      ? await agent.resumeStream(resume.data, { ...options, runId: resume.runId, toolCallId: resume.toolCallId }).catch((e: unknown) => {
          if (isResumeGone(e)) throw new AppError(RESUME_GONE, "A pergunta anterior expirou", 409);
          throw e;
        })
      : await agent.stream(
          messages.map((m) => (m.role === "user" ? { role: "user" as const, content: m.content } : { role: "assistant" as const, content: m.content })),
          options,
        );

    let text = "";
    let suspended: AgentSuspension | undefined;
    // Na retomada, se a tool suspende de novo, nenhum passo do modelo roda; o usage que o Mastra devolve
    // é o da etapa suspensa anterior e não pode ser contado de novo.
    let modelStepRan = !resume;
    for await (const chunk of stream.fullStream) {
      if (chunk.type === "step-start") {
        modelStepRan = true;
      } else if (chunk.type === "text-delta") {
        text += chunk.payload.text;
        onTextDelta(chunk.payload.text);
      } else if (chunk.type === "tool-call-suspended") {
        suspended = { runId: stream.runId, toolCallId: chunk.payload.toolCallId, toolId: chunk.payload.toolName, payload: chunk.payload.suspendPayload };
      } else if (chunk.type === "error") {
        throw agentError(chunk.payload.error);
      }
    }

    const usage = modelStepRan ? await stream.usage.catch(() => undefined) : undefined;
    const finishReason = await stream.finishReason.catch(() => undefined);
    return {
      text,
      model: config.model,
      finishReason: finishReason ?? undefined,
      suspended,
      usage: usage
        ? {
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            ...(usage.cachedInputTokens !== undefined ? { cachedInputTokens: usage.cachedInputTokens } : {}),
          }
        : undefined,
    };
  };
}
