/**
 * Orquestra UM turno de conversa. Ordem de decisão:
 *   estado da conversa → ação pendente (confirmar/cancelar/editar) → run suspensa (HITL: retoma o agent com a resposta)
 *   → flow ativo (sem LLM) → agent (LLM).
 * Tudo que o agent faz passa por tools embrulhadas (trace); efeitos colaterais só após confirmação.
 * @wiki docs/brain/functions/Turn.md
 */
import { RequestContext } from "@mastra/core/request-context";
import { AppError } from "@/lib/errors";
import type { Employee } from "@/services/employees/employeeService";
import {
  addMessage, getConversation, listMessages, updateConversation, type Conversation, type Message,
} from "@/services/conversations/conversationService";
import { getAssistant } from "../registry";
import type { AgentRunner, AgentRunParams } from "../agent/types";
import { agentError, createMastraRunner, RESUME_GONE } from "../agent/mastraRunner";
import { discardSuspendedRun } from "../agent/mastra";
import { newCollector, wrapTools, type TurnCollector } from "../tools/wrap";
import { advanceFlow, CANCEL_OPTION, isCancelInput, resumeAtStep, startFlow, type FlowStepResult } from "../flows/runner";
import { interpretPendingInput, pendingParts } from "../actions/pending";
import { encodeSse, type ChatEvent, type Emit } from "./events";
import { publicConversation } from "./view";
import {
  PAYLOAD_OPTIONS, type AfterEffect, type AssistantConfig, type FlowState, type Payload, type PayloadPart,
  type PendingAction, type QuickOption, type SuspendedRun, type SuspendPrompt, type Trace, type TurnContext, type TurnInput,
} from "../types";

const CANCEL_SUSPENDED_TEXT = "Ok, cancelei. Se quiser, é só me dizer o que precisa.";

export interface TurnParams {
  conversationId: string;
  user: Employee;
  input: TurnInput;
  emit?: Emit;
  runner?: AgentRunner;
  now?: Date;
}

export interface TurnResult { conversation: Conversation; messages: Message[] }

export const ANALYST_OPTION: QuickOption = { id: "falar-com-um-analista", label: "Falar com um analista" };

let defaultRunner: AgentRunner | undefined;

/** Troca o runner padrão (testes injetam um roteirizado; produção usa Mastra). */
export function setDefaultRunner(runner?: AgentRunner): void {
  defaultRunner = runner;
}

export async function runTurn(p: TurnParams): Promise<TurnResult> {
  const now = p.now ?? new Date();
  const emit: Emit = p.emit ?? (() => {});
  const runner = p.runner ?? (defaultRunner ??= createMastraRunner());

  let conv = getConversation(p.conversationId);
  if (!conv || conv.employeeId !== p.user.id) throw new AppError("NOT_FOUND", "Conversa não encontrada", 404);
  const config = getAssistant(conv.assistantId);
  if (conv.state === "closed") throw new AppError("CONVERSATION_CLOSED", "Esta conversa foi encerrada. Inicie uma nova conversa.", 409);
  if (conv.userMessageCount >= config.limits.maxUserMessages) {
    throw new AppError("MESSAGE_LIMIT", `Limite de ${config.limits.maxUserMessages} mensagens por conversa atingido. Inicie uma nova conversa.`, 409);
  }

  const content = resolveContent(conv, p.input);
  if (!content) throw new AppError("INVALID_BODY", "Envie um texto ou uma opção", 400);
  addMessage(conv.id, { role: "user", content }, now);
  emit({ type: "message.start" });

  const produced: Message[] = [];
  const ctx = { userId: p.user.id, conversationId: conv.id, now };
  const t = new TurnHelpers(config, conv.id, emit, produced, now);

  if (conv.state !== "agent") {
    // Analista envolvido: a mensagem fica na fila dele; o agent não responde.
    return t.finish();
  }

  if (conv.suspendedRun) {
    // Uma tool parou para perguntar: a resposta retoma a run do agent de onde ela parou.
    if (isCancelInput(p.input)) {
      updateConversation(conv.id, { suspendedRun: null }, now);
      discardSuspendedRun(conv.suspendedRun.runId);
      t.reply(conv.suspendedRun.prompt.cancelText ?? CANCEL_SUSPENDED_TEXT, [], { source: "rule", notes: [`${conv.suspendedRun.toolId}: pergunta cancelada pelo funcionário`] });
      return t.finish();
    }
    const { runId, toolCallId } = conv.suspendedRun;
    await t.agentTurn(conv, p.user, runner, ctx, { runId, toolCallId, data: { text: content, ...(p.input.optionId ? { optionId: p.input.optionId } : {}) } });
    return t.finish();
  }

  if (conv.pendingAction) {
    const intent = interpretPendingInput(p.input);
    if (intent?.kind === "confirm") {
      await t.executePending(conv.pendingAction, ctx);
      return t.finish();
    }
    if (intent?.kind === "cancel") {
      updateConversation(conv.id, { pendingAction: null }, now);
      t.reply("Ok, descartei o rascunho. Se quiser, é só me dizer o que precisa.", [], { source: "rule", notes: ["rascunho cancelado pelo funcionário"] });
      return t.finish();
    }
    if (intent?.kind === "edit") {
      const snapshot = conv.pendingAction.input.flow as FlowState | undefined;
      const flow = snapshot && config.flows[snapshot.flowId];
      const resumed = flow && resumeAtStep(flow, snapshot.data, intent.stepKey, ctx);
      if (resumed) {
        updateConversation(conv.id, { pendingAction: null }, now);
        await t.applyFlowResult(resumed, ctx);
        return t.finish();
      }
    }
    // Texto livre diante de um rascunho: o agent decide (com o rascunho no contexto).
  } else if (conv.activeFlow) {
    const flow = config.flows[conv.activeFlow.flowId];
    if (!flow) {
      updateConversation(conv.id, { activeFlow: null }, now);
    } else {
      await t.applyFlowResult(await advanceFlow(flow, conv.activeFlow, p.input, ctx), ctx);
      return t.finish();
    }
  }

  await t.agentTurn(conv, p.user, runner, ctx);
  return t.finish();
}

/** Texto gravado como mensagem do usuário: o texto, ou o rótulo da opção clicada. */
function resolveContent(conv: Conversation, input: TurnInput): string | undefined {
  const text = input.text?.trim();
  if (text) return text;
  if (!input.optionId) return undefined;
  const last = listMessages(conv.id).reverse().find((m) => m.role === "agent");
  for (const part of last?.payload ?? []) {
    if (part.kind !== PAYLOAD_OPTIONS) continue;
    const hit = (part.data as QuickOption[]).find((o) => o.id === input.optionId);
    if (hit) return hit.label;
  }
  return input.optionId;
}

class TurnHelpers {
  constructor(
    private readonly config: AssistantConfig,
    private readonly conversationId: string,
    private readonly emit: Emit,
    private readonly produced: Message[],
    private readonly now: Date,
  ) {}

  finish(): TurnResult {
    const conversation = getConversation(this.conversationId)!;
    this.emit({ type: "conversation", conversation: publicConversation(conversation) });
    return { conversation, messages: this.produced };
  }

  /** Grava e emite uma resposta do assistente. */
  reply(text: string, payload: Payload, trace: Partial<Trace> & { source: Trace["source"] }, started = this.now.getTime()): Message {
    const full: Trace = { actions: [], durationMs: Date.now() - started, ...trace };
    for (const part of payload) this.emit({ type: "payload", part });
    this.emit({ type: "trace", trace: full });
    const m = addMessage(this.conversationId, { role: "agent", content: text, payload, trace: full });
    this.produced.push(m);
    this.emit({ type: "message.end", message: m });
    return m;
  }

  system(text: string): Message {
    const m = addMessage(this.conversationId, { role: "system", content: text });
    this.produced.push(m);
    this.emit({ type: "message.end", message: m });
    return m;
  }

  async applyFlowResult(r: FlowStepResult, ctx: { userId: string; conversationId: string; now: Date }): Promise<void> {
    const started = Date.now();
    if (r.kind === "ask") {
      updateConversation(this.conversationId, { activeFlow: r.state }, this.now);
      const stepKey = this.config.flows[r.state.flowId]?.steps[r.state.stepIndex]?.key;
      this.reply(r.reply.text, [{ kind: PAYLOAD_OPTIONS, data: r.reply.options }], { source: "flow", notes: [`flow ${r.state.flowId}: pergunta "${stepKey}"`] }, started);
      return;
    }
    if (r.kind === "cancelled") {
      updateConversation(this.conversationId, { activeFlow: null }, this.now);
      this.reply(r.text, [], { source: "flow", notes: ["flow cancelado pelo funcionário"] }, started);
      return;
    }
    // done
    const payload: Payload = [...(r.outcome.payload ?? [])];
    let pending: PendingAction | null = null;
    if (r.outcome.pendingAction) {
      pending = r.outcome.pendingAction;
      payload.push(...pendingParts(pending));
    }
    updateConversation(this.conversationId, { activeFlow: null, pendingAction: pending }, this.now);
    this.reply(r.outcome.text, payload, { source: "flow", ...r.outcome.trace }, started);
    void ctx;
  }

  async executePending(pending: PendingAction, ctx: { userId: string; conversationId: string; now: Date }): Promise<void> {
    const started = Date.now();
    const executor = this.config.actions[pending.kind];
    if (!executor) throw new AppError("ACTION_UNKNOWN", `Ação '${pending.kind}' não registrada`, 500);
    updateConversation(this.conversationId, { pendingAction: null }, this.now);
    try {
      const result = await executor(pending.input, ctx);
      this.reply(result.text, result.payload ?? [], { source: "action", ...result.trace }, started);
      this.applyAfterEffects(result.afterEffects ?? []);
    } catch (e) {
      const code = e instanceof AppError ? e.code : "ERROR";
      // Falha ao executar (ex.: legado indisponível): mantém o rascunho para tentar de novo.
      updateConversation(this.conversationId, { pendingAction: pending }, this.now);
      const text = code === "TICKET_SERVICE_UNAVAILABLE"
        ? "O sistema de chamados está instável neste momento e não consegui concluir. O rascunho continua salvo: tente confirmar novamente em alguns segundos."
        : `Não consegui concluir: ${e instanceof Error ? e.message : String(e)}. O rascunho continua salvo.`;
      this.reply(text, pendingParts(pending), {
        source: "action",
        actions: [{ id: "exec", tool: pending.kind, label: pending.label, status: "error", summary: code }],
        notes: [`${pending.kind}: ${code}`],
      }, started);
    }
  }

  applyAfterEffects(effects: AfterEffect[]): void {
    for (const e of effects) {
      if (e.type === "transfer") {
        const conv = getConversation(this.conversationId)!;
        if (conv.state !== "agent") continue;
        updateConversation(this.conversationId, { state: "waiting_analyst", transferReason: e.reason, transferSummary: e.summary }, this.now);
        this.system(`Conversa transferida para um analista. Motivo: ${e.reason}. Resumo: ${e.summary}`);
      } else if (e.type === "link-ticket") {
        updateConversation(this.conversationId, { ticketId: e.ticketId }, this.now);
      }
    }
  }

  async agentTurn(
    conv: Conversation, user: Employee, runner: AgentRunner, ctx: { userId: string; conversationId: string; now: Date },
    resume?: AgentRunParams["resume"],
  ): Promise<void> {
    const started = Date.now();
    const collector = newCollector();
    const tools = wrapTools(this.config, collector, this.emit, { hasPendingAction: !!conv.pendingAction });
    const requestContext = new RequestContext<TurnContext>();
    requestContext.set("userId", user.id);
    requestContext.set("conversationId", conv.id);
    requestContext.set("assistantId", this.config.id);
    requestContext.set("now", this.now.toISOString());

    const result = await runner({
      config: this.config,
      tools,
      messages: resume ? [] : buildHistory(conv, this.config.limits.historyWindow),
      system: buildSystemContext(this.config, conv, user, this.now),
      requestContext,
      onTextDelta: (delta) => this.emit({ type: "text.delta", delta }),
      ...(resume ? { resume } : {}),
    }).catch((e: unknown) => {
      throw e instanceof AppError ? e : agentError(e);
    }).catch((e: AppError) => {
      if (resume && e.code === RESUME_GONE) {
        // O snapshot da run sumiu (ex.: storage limpo): descarta a pergunta e pede para recomeçar.
        updateConversation(this.conversationId, { suspendedRun: null }, this.now);
        this.reply("Perdi o contexto da pergunta anterior. Pode me dizer de novo o que precisa?", [], { source: "rule", notes: ["run suspensa não encontrada ao retomar"] }, started);
        return undefined;
      }
      throw e;
    });
    if (!result) return;

    let text = result.text.trim();
    const trace: Trace = {
      source: "agent",
      actions: collector.actions,
      decision: collector.decision,
      model: result.model,
      usage: result.usage,
      durationMs: 0,
      notes: collector.notes,
    };

    if (result.suspended) {
      // A run parou numa pergunta ao funcionário: persiste a run e responde com a pergunta e suas opções.
      const prompt = collector.suspended?.prompt ?? (result.suspended.payload as SuspendPrompt);
      const run: SuspendedRun = { runId: result.suspended.runId, toolCallId: result.suspended.toolCallId, toolId: result.suspended.toolId, prompt, startedAt: this.now.toISOString() };
      updateConversation(this.conversationId, { suspendedRun: run, pendingAction: null, activeFlow: null }, this.now);
      const payload = mergeOptions([], [...(prompt.options ?? []), CANCEL_OPTION]);
      trace.notes = [...collector.notes, `${run.toolId}: aguardando resposta do funcionário`];
      trace.durationMs = Date.now() - started;
      this.reply(text ? `${text}\n\n${prompt.text}` : prompt.text, payload, trace, started);
      return;
    }

    let payload: Payload = mergeOptions(collector.payload, collector.options);
    let pending: PendingAction | null | undefined = undefined;

    if (collector.pending) {
      pending = { ...collector.pending, createdAt: this.now.toISOString() };
      payload = [...payload.filter((x) => x.kind !== PAYLOAD_OPTIONS), ...pendingParts(pending)];
    } else if (collector.cancelPending) {
      pending = null;
    }

    const transferred = collector.afterEffects.some((e) => e.type === "transfer");
    if (collector.decision?.confidence === "baixa" && !transferred && !pending && !collector.startFlow) {
      payload = mergeOptions(payload, [ANALYST_OPTION]);
      collector.notes.push("confiança baixa: oferecida transferência");
    }
    if (!text) text = collector.startFlow ? "" : "Certo.";

    trace.durationMs = Date.now() - started;
    updateConversation(this.conversationId, { suspendedRun: null, ...(pending !== undefined ? { pendingAction: pending } : {}) }, this.now);
    if (text || payload.length) this.reply(text, payload, trace, started);

    if (collector.confirmPending && conv.pendingAction) await this.executePending(conv.pendingAction, ctx);

    if (collector.startFlow) {
      const flow = this.config.flows[collector.startFlow.flowId];
      if (flow) {
        updateConversation(this.conversationId, { pendingAction: null }, this.now);
        await this.applyFlowResult(await startFlow(flow, collector.startFlow.data, ctx, collector.startFlow.intro), ctx);
      }
    }

    this.applyAfterEffects(collector.afterEffects);
  }
}

function mergeOptions(payload: PayloadPart[], extra: QuickOption[]): Payload {
  const options: QuickOption[] = [];
  const seen = new Set<string>();
  const push = (o: QuickOption) => { if (!seen.has(o.id)) { seen.add(o.id); options.push(o); } };
  for (const part of payload) if (part.kind === PAYLOAD_OPTIONS) (part.data as QuickOption[]).forEach(push);
  extra.forEach(push);
  const rest = payload.filter((p) => p.kind !== PAYLOAD_OPTIONS);
  return options.length ? [...rest, { kind: PAYLOAD_OPTIONS, data: options.slice(0, 6) }] : rest;
}

/** Últimas N mensagens no formato do modelo. Falas do analista e do sistema viram texto marcado no turno do usuário. */
function buildHistory(conv: Conversation, window: number): { role: "user" | "assistant"; content: string }[] {
  const all = listMessages(conv.id);
  const recent = all.slice(-window);
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of recent) {
    if (m.role === "agent") out.push({ role: "assistant", content: m.content || "(resposta estruturada)" });
    else if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "analyst") out.push({ role: "user", content: `[Mensagem do analista humano] ${m.content}` });
    else out.push({ role: "user", content: `[Sistema] ${m.content}` });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

function buildSystemContext(config: AssistantConfig, conv: Conversation, user: Employee, now: Date): string {
  const lines = [
    `Funcionário logado: ${user.name} (${user.department}), ${user.email}, id ${user.id}.`,
    `Agora: ${now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" })} (horário de Brasília).`,
    `Mensagens restantes do funcionário nesta conversa: ${config.limits.maxUserMessages - conv.userMessageCount - 1}.`,
  ];
  if (conv.pendingAction) {
    lines.push(
      `Há um rascunho aguardando confirmação (${conv.pendingAction.label}): ${JSON.stringify(conv.pendingAction.draft)}. ` +
        "Se o funcionário confirmar em texto, chame confirm-pending-action; se quiser mudar algo, refaça a ação com os dados ajustados; se desistir, cancel-pending-action.",
    );
  }
  if (conv.transferSummary) lines.push(`Esta conversa já passou por um analista e foi devolvida a você. Resumo da transferência: ${conv.transferSummary}`);
  const extra = config.contextFor?.({ userId: user.id, now });
  if (extra) lines.push(extra);
  return lines.join("\n");
}

/** Executa o turno escrevendo eventos SSE num stream HTTP. */
export function turnAsEventStream(params: Omit<TurnParams, "emit">): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => controller.enqueue(encoder.encode(encodeSse(e)));
      try {
        await runTurn({ ...params, emit });
      } catch (e) {
        if (e instanceof AppError) emit({ type: "error", code: e.code, message: e.message });
        else {
          console.error(e);
          emit({ type: "error", code: "INTERNAL", message: "Erro interno" });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
