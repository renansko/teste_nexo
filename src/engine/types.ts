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
  /** Passo interno (ex.: busca na central): fica no trace, mas o chat do funcionário não o lista acima da resposta. */
  quiet?: true;
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

// ---- Human-in-the-loop (tool suspende a run do agent para perguntar ao funcionário) ----

/**
 * Payload com que uma tool HITL suspende a run (`context.suspend(prompt)`): o engine só renderiza
 * `text` + `options` (+ cancelar). `stepKey`/`data` são estado da própria tool, devolvidos a ela na retomada.
 * @wiki docs/brain/services/HumanInTheLoop.md
 */
export interface SuspendPrompt {
  text: string;
  options?: QuickOption[];
  stepKey?: string;
  data?: FlowData;
  /** Texto ao cancelar a pergunta (descarta a run suspensa). */
  cancelText?: string;
}

/** Resposta do funcionário entregue à tool na retomada (`context.resumeData`): a mesma entrada do turno. */
export type ResumeAnswer = TurnInput;

/** Run do agent suspensa aguardando resposta; persistida em `conversations.suspended_run`. */
export interface SuspendedRun {
  runId: string;
  toolCallId: string;
  toolId: string;
  prompt: SuspendPrompt;
  startedAt: string;
}

// ---- Ação pendente (confirmação obrigatória antes de efeito colateral) ----

export interface PendingAction {
  /** Id do rascunho; é a chave de idempotência da execução (atribuído pelo engine ao gravar). */
  id?: string;
  /** Nome do executor registrado na persona (ex.: "create-ticket"). */
  kind: string;
  /** Dados necessários para executar; ficam persistidos. */
  input: Record<string, unknown>;
  /** Rascunho legível (o cliente renderiza; o engine não interpreta). */
  draft: object;
  /** Rótulo humano para o trace: "criar chamado". */
  label: string;
  /** Opções além de confirmar/cancelar (ex.: editar um campo → volta ao flow). */
  extraOptions?: QuickOption[];
  createdAt: string;
}

export interface ActionContext {
  userId: string;
  conversationId: string;
  now: Date;
  /** Chave de idempotência (id do rascunho): repetir a execução com a mesma chave não grava duas vezes. */
  idempotencyKey?: string;
}

export interface ActionResult {
  text: string;
  payload?: Payload;
  trace?: Partial<Trace>;
  afterEffects?: AfterEffect[];
  /** Novo rascunho a confirmar (ex.: a criação virou complemento porque surgiu um duplicado). */
  pendingAction?: PendingAction;
}

/** Efeitos que o engine aplica após uma ação/turno (regras determinísticas da persona). */
export type AfterEffect =
  /** `reason` é o código (vai para `transferReason`); `label` é o texto humano exibido na mensagem de sistema. */
  | { type: "transfer"; reason: string; label?: string; summary: string }
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
  tool: Tool<any, any, any, any>;
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
  /** Consulta interna: entra no trace (analista, "Por quê?"), mas o chat do funcionário não a anuncia acima da resposta. */
  quiet?: boolean;
}

/** Output de uma tool que inicia um flow determinístico. */
export interface StartFlowOutput { startFlow: { flowId: string; data: FlowData; intro?: string } }

/** Output de uma tool que concluiu um chat-formulário por conta própria (HITL): rascunho, payload e trace do resultado. */
export interface FlowOutcomeOutput { outcome: FlowOutcome }

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
  /** Ganchos para transições da conversa que o engine dispara (ex.: sincronizar o chamado vinculado). */
  hooks?: AssistantHooks;
}

/** O que um gancho recebe: o suficiente para achar o chamado vinculado sem acoplar o engine ao domínio da persona. */
export interface ConversationRef { id: string; employeeId: string; ticketId: string | null }

/**
 * Ganchos síncronos e best-effort: o engine os chama DEPOIS de gravar a transição e engole exceções (log),
 * então um sistema externo fora do ar nunca impede transferir ou assumir uma conversa.
 */
export interface AssistantHooks {
  /** Conversa passou a `waiting_analyst` (tool, chamado crítico ou confiança baixa). */
  onTransferred?: (conv: ConversationRef, info: { reason: string; now: Date }) => void;
  /** Analista assumiu a conversa (`take`). */
  onTaken?: (conv: ConversationRef, info: { analystId: string; now: Date }) => void;
}
