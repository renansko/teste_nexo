/**
 * Runner baseado em Mastra. Cria o Agent por turno (barato) com as tools já embrulhadas,
 * instruções estáveis em `instructions` (cache de prompt automático no provedor) e contexto volátil em `system`.
 * O modelo é a string `provedor/modelo` de `NEXO_MODEL`: o model router do Mastra resolve o provedor e a chave.
 * @wiki docs/brain/services/AssistantConfig.md
 */
import { Agent } from "@mastra/core/agent";
import { AppError } from "@/lib/errors";
import type { AgentRunner } from "./types";

type ModelConfig = ConstructorParameters<typeof Agent>[0]["model"];

export const AGENT_ERROR_MESSAGE = "Não consegui consultar o assistente agora. Tente novamente em instantes.";

/** Detalhe técnico vai para o log do servidor; o cliente recebe mensagem genérica (sem vazar provedor/chaves). */
export function agentError(cause: unknown): AppError {
  const detail = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : JSON.stringify(cause);
  console.error("[agent] falha ao consultar o modelo:", detail);
  return new AppError("AGENT_ERROR", AGENT_ERROR_MESSAGE, 502);
}

/** `opts.model` troca a resolução do modelo (testes injetam um modelo simulado); por padrão a string vai direto ao router. */
export function createMastraRunner(opts: { model?: (id: string) => ModelConfig } = {}): AgentRunner {
  const resolveModel = opts.model ?? ((id: string) => id as ModelConfig);
  return async ({ config, tools, messages, system, requestContext, onTextDelta }) => {
    const agent = new Agent({
      id: config.id,
      name: config.name,
      instructions: config.instructions,
      model: resolveModel(config.model),
      tools,
    });

    const modelMessages = messages.map((m) =>
      m.role === "user" ? { role: "user" as const, content: m.content } : { role: "assistant" as const, content: m.content },
    );
    const stream = await agent.stream(modelMessages, {
      requestContext,
      maxSteps: config.limits.maxSteps,
      ...(system ? { system } : {}),
    });

    let text = "";
    for await (const chunk of stream.fullStream) {
      if (chunk.type === "text-delta") {
        text += chunk.payload.text;
        onTextDelta(chunk.payload.text);
      } else if (chunk.type === "error") {
        throw agentError(chunk.payload.error);
      }
    }

    const usage = await stream.usage.catch(() => undefined);
    const finishReason = await stream.finishReason.catch(() => undefined);
    return {
      text,
      model: config.model,
      finishReason: finishReason ?? undefined,
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
