/**
 * Tipos do engine de chat (persona-agnóstico). A persona (ex.: Nexo) só estende via `AssistantConfig`.
 * @wiki docs/brain/services/AssistantConfig.md
 */
import type { Tool } from "@mastra/core/tools";

// ---- Conteúdo estruturado das mensagens ----

/** Opção de resposta rápida que o cliente renderiza como botão. */
export interface QuickOption { id: string; label: string }

/** Parte estruturada de uma mensagem (cards, listas, rascunhos...). `kind` é definido pela persona, exceto os reservados. */
export interface PayloadPart { kind: string; data: unknown }
export type Payload = PayloadPart[];

/** Kinds reservados pelo engine. */
export const PAYLOAD_OPTIONS = "options" as const; // data: QuickOption[]
export const PAYLOAD_DRAFT = "draft" as const; // data: PendingAction["draft"]

// ---- Transparência (trace de decisão) ----

export type Confidence = "alta" | "media" | "baixa";

export interface TraceAction {
  id: string;
  tool: string;
  /** Texto humano exibido acima da resposta: "consultou seus chamados". */
  label: string;
  status: "done" | "error" | "pending";
  input?: unknown;
  summary?: string;
  durationMs?: number;
}

export interface Decision {
  understanding: string;
  action: string;
  confidence: Confidence;
  reasoning: string;
}

export interface Trace {
  /** Quem produziu a resposta: o agent (LLM), um flow determinístico, uma ação confirmada ou uma regra. */
  source: "agent" | "flow" | "action" | "rule";
  actions: TraceAction[];
  decision?: Decision;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number; cachedInputTokens?: number };
  durationMs: number;
  notes?: string[];
}

// ---- Conversa ----

export type ConversationState = "agent" | "waiting_analyst" | "analyst" | "closed";
export type MessageRole = "user" | "agent" | "analyst" | "system";

/** Entrada de um turno: texto livre ou escolha de uma opção rápida (com texto opcional). */
export interface TurnInput { text?: string; optionId?: string }

// ---- Flows determinísticos (chat-formulário) ----

export type FlowData = Record<string, string>;

export interface FlowStep {
  key: string;
  prompt: string | ((data: FlowData) => string);
  type: "text" | "choice";
  options?: QuickOption[] | ((data: FlowData) => QuickOption[]);
  /** Pula o passo quando devolve true (ex.: já preenchido pelo agent). */
  skipIf?: (data: FlowData) => boolean;
  /** Devolve mensagem de erro para repetir a pergunta, ou undefined se válido. */
  validate?: (value: string, data: FlowData) => string | undefined;
}

export interface FlowContext { userId: string; conversationId: string; now: Date }

export interface FlowOutcome {
  /** Texto final enviado ao usuário. */
  text: string;
  payload?: Payload;
  /** Ação que fica aguardando confirmação (rascunho), se houver. */
  pendingAction?: PendingAction;
  trace?: Partial<Trace>;
}

export interface FlowDefinition {
  id: string;
  /** Texto mostrado ao iniciar o flow (antes da primeira pergunta). */
  intro?: string | ((data: FlowData) => string);
  steps: FlowStep[];
  /** Chamado quando todos os passos foram respondidos. Pode chamar LLM (classificação) e serviços. */
  onComplete: (data: FlowData, ctx: FlowContext) => Promise<FlowOutcome>;
  /** Texto ao cancelar. */
  cancelText?: string;
}

export interface FlowState { flowId: string; data: FlowData; stepIndex: number; startedAt: string }

// ---- Ação pendente (confirmação obrigatória antes de efeito colateral) ----

export interface PendingAction {
  /** Nome do executor registrado na persona (ex.: "create-ticket"). */
  kind: string;
  /** Dados necessários para executar; ficam persistidos. */
  input: Record<string, unknown>;
  /** Rascunho legível (o cliente renderiza; o engine não interpreta). */
  draft: Record<string, unknown>;
  /** Rótulo humano para o trace: "criar chamado". */
  label: string;
  /** Opções além de confirmar/cancelar (ex.: editar um campo → volta ao flow). */
  extraOptions?: QuickOption[];
  createdAt: string;
}

export interface ActionContext { userId: string; conversationId: string; now: Date }

export interface ActionResult { text: string; payload?: Payload; trace?: Partial<Trace>; afterEffects?: AfterEffect[] }

/** Efeitos que o engine aplica após uma ação/turno (regras determinísticas da persona). */
export type AfterEffect =
  | { type: "transfer"; reason: string; summary: string }
  | { type: "link-ticket"; ticketId: string };

// ---- Tools ----

/** Contexto por requisição disponível nas tools via `context.requestContext`. */
export interface TurnContext extends Record<string, unknown> {
  userId: string;
  conversationId: string;
  assistantId: string;
  now: string;
}

export interface ToolSpec<TIn = any, TOut = any> {
  tool: Tool<any, any, any>;
  /** Texto humano do trace: "consultou seus chamados". Pode usar o input. */
  label: string | ((input: TIn) => string);
  /** Resumo curto do resultado para o trace: "3 chamados, 1 vencido". */
  summarize?: (input: TIn, output: TOut) => string | undefined;
  /** Partes estruturadas (cards, opções) que o cliente renderiza junto da resposta. */
  toPayload?: (input: TIn, output: TOut) => PayloadPart[] | undefined;
  /** O que o modelo vê (padrão: o output inteiro). Use para reduzir tokens. */
  toModel?: (output: TOut) => unknown;
  /** Efeitos que o engine aplica ao fim do turno (transferência, vínculo de chamado). */
  afterEffects?: (input: TIn, output: TOut) => AfterEffect[] | undefined;
  /**
   * Se true, a tool não produz efeito: seu `execute` devolve uma `PendingAction` que fica
   * aguardando confirmação explícita do usuário (rascunho → Confirmar).
   */
  requiresConfirmation?: boolean;
  /** Tools internas do engine não aparecem como ação no trace. */
  hidden?: boolean;
}

/** Output de uma tool que inicia um flow determinístico. */
export interface StartFlowOutput { startFlow: { flowId: string; data: FlowData; intro?: string } }

// ---- Persona ----

export interface AssistantConfig {
  id: string;
  name: string;
  /** Instruções estáveis (cacheáveis). Contexto por requisição vai em `contextFor`. */
  instructions: string;
  model: string;
  /** Modelo barato para classificações auxiliares. */
  fastModel?: string;
  tools: Record<string, ToolSpec>;
  flows: Record<string, FlowDefinition>;
  /** Executores de ações pendentes. */
  actions: Record<string, (input: Record<string, unknown>, ctx: ActionContext) => Promise<ActionResult>>;
  limits: { maxUserMessages: number; maxSteps: number; historyWindow: number };
  /** Mensagem de sistema por requisição (nome do usuário, data...). Mantida curta e fora do cache. */
  contextFor?: (ctx: { userId: string; now: Date }) => string | undefined;
  /** Texto quando a conversa está com analista. */
  waitingText?: string;
}
