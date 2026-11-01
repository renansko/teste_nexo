/**
 * Fronteira entre o engine e o framework de agent. O orquestrador só conhece este contrato;
 * `mastraRunner.ts` implementa com Mastra, e os testes injetam um runner roteirizado.
 */
import type { Tool } from "@mastra/core/tools";
import type { RequestContext } from "@mastra/core/request-context";
import type { AssistantConfig, ResumeAnswer, Trace, TurnContext } from "../types";

export interface AgentMessage { role: "user" | "assistant"; content: string }

export interface AgentRunParams {
  config: AssistantConfig;
  /** Tools já embrulhadas pelo engine (trace, confirmação, contexto). */
  tools: Record<string, Tool<any, any, any>>;
  /** Histórico do turno; ignorado na retomada (o snapshot da run já o contém). */
  messages: AgentMessage[];
  /** Contexto volátil da requisição (usuário, data, estado da conversa). Fica fora do cache. */
  system?: string;
  requestContext: RequestContext<TurnContext>;
  onTextDelta: (delta: string) => void;
  /** Retoma uma run suspensa por uma tool HITL com a resposta do funcionário. */
  resume?: { runId: string; toolCallId: string; data: ResumeAnswer };
}

/** A run parou numa tool que suspendeu para perguntar ao funcionário. */
export interface AgentSuspension { runId: string; toolCallId: string; toolId: string; payload: unknown }

export interface AgentRunResult {
  text: string;
  model: string;
  usage?: Trace["usage"];
  finishReason?: string;
  suspended?: AgentSuspension;
}

export type AgentRunner = (params: AgentRunParams) => Promise<AgentRunResult>;
