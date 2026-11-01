/**
 * Runner baseado em Mastra. Cria o Agent por turno (barato) com as tools já embrulhadas,
 * instruções estáveis marcadas para cache de prompt e contexto volátil em `system`.
 * @wiki docs/brain/services/AssistantConfig.md
 */
import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { AppError } from "@/lib/errors";
import type { AgentRunner } from "./types";

type ModelConfig = ConstructorParameters<typeof Agent>[0]["model"];

export function createMastraRunner(opts: { model?: (id: string) => ModelConfig } = {}): AgentRunner {
  const resolveModel = opts.model ?? ((id: string) => anthropic(id) as unknown as ModelConfig);
  return async ({ config, tools, messages, system, requestContext, onTextDelta }) => {
    const agent = new Agent({
      id: config.id,
      name: config.name,
      instructions: {
        role: "system",
        content: config.instructions,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
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
        const err = chunk.payload.error;
        const message = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
        throw new AppError("AGENT_ERROR", `Falha ao consultar o modelo: ${message}`, 502);
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
