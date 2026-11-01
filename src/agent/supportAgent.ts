/** @wiki docs/brain/services/SupportAgent.md */
import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import type { Tool } from "@mastra/core/tools";
import { getTicketTool, listTicketsTool } from "./tools";

/** Cria o agent com tools extras ligadas à conversa atual (ex.: escalar). */
export const createSupportAgent = (extraTools: Record<string, Tool<any, any, any>> = {}) => new Agent({
  id: "support-agent",
  name: "Nexo Assist",
  instructions: `Você é o assistente de suporte da Nexo. Responda em português, de forma objetiva.
Use as tools para consultar chamados; nunca invente status ou dados de chamados.
Se não souber resolver ou o cliente pedir um humano, diga que vai encaminhar a um analista.`,
  model: anthropic(process.env.NEXO_MODEL ?? "claude-sonnet-5-5"),
  tools: { getTicketTool, listTicketsTool, ...extraTools },
});
