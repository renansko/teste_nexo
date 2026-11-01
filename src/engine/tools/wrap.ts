/**
 * Embrulha as tools da persona para: registrar ações no trace (com rótulo humano), emitir eventos em tempo real,
 * reter ações que exigem confirmação, coletar payloads/opções/efeitos, observar suspensões (HITL)
 * e nunca lançar erro para dentro do modelo.
 * @wiki docs/brain/entities/DecisionTrace.md
 */
import { randomUUID } from "node:crypto";
import { createTool, type Tool } from "@mastra/core/tools";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { ChatEvent } from "../conversation/events";
import { observeSuspend } from "./hitl";
import type {
  AfterEffect, AssistantConfig, Decision, FlowData, FlowOutcome, PayloadPart, PendingAction, QuickOption, SuspendPrompt, ToolSpec, TraceAction,
} from "../types";

/** Tudo que as tools "deixam" para o orquestrador consolidar ao fim do turno. */
export interface TurnCollector {
  actions: TraceAction[];
  payload: PayloadPart[];
  options: QuickOption[];
  decision?: Decision;
  pending?: PendingAction;
  startFlow?: { flowId: string; data: FlowData; intro?: string };
  /** Uma tool suspendeu a run para perguntar ao funcionário. */
  suspended?: { toolId: string; prompt: SuspendPrompt };
  afterEffects: AfterEffect[];
  notes: string[];
  confirmPending?: boolean;
  cancelPending?: boolean;
}

export const newCollector = (): TurnCollector => ({ actions: [], payload: [], options: [], afterEffects: [], notes: [] });

export const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);

export function wrapTools(
  config: AssistantConfig,
  collector: TurnCollector,
  emit: (e: ChatEvent) => void,
  opts: { hasPendingAction: boolean },
): Record<string, Tool<any, any, any>> {
  const out: Record<string, Tool<any, any, any>> = {};
  for (const spec of Object.values({ ...config.tools, ...engineTools(collector, opts) })) {
    out[spec.tool.id] = wrapTool(spec, collector, emit); // chave = id: é o nome que o modelo vê
  }
  return out;
}

/** Resposta ao modelo quando a tool deixou um rascunho aguardando confirmação. */
const awaitingConfirmation = (pending: PendingAction, summary?: string) => ({
  status: "awaiting_confirmation",
  draft: pending.draft,
  ...(summary ? { summary } : {}),
  note: "Apresente o rascunho e peça que o funcionário confirme pelos botões.",
});

function wrapTool(spec: ToolSpec, collector: TurnCollector, emit: (e: ChatEvent) => void): Tool<any, any, any> {
  const base = spec.tool;
  return createTool({
    id: base.id,
    description: base.description,
    inputSchema: base.inputSchema ?? z.object({}),
    ...(base.suspendSchema ? { suspendSchema: base.suspendSchema } : {}),
    ...(base.resumeSchema ? { resumeSchema: base.resumeSchema } : {}),
    execute: async (input: Record<string, unknown>, context) => {
      const action: TraceAction = {
        id: randomUUID().slice(0, 8),
        tool: base.id,
        label: typeof spec.label === "function" ? spec.label(input) : spec.label,
        status: "pending",
        input,
      };
      const started = Date.now();
      const position = collector.actions.length; // a ação da tool precede as ações sintéticas que ela registrar
      if (!spec.hidden) emit({ type: "action", action: { ...action } });
      let suspended = false;
      // Observa a suspensão: a pergunta vai para o collector e a ação fica pendente no trace.
      const observed = observeSuspend(context, (payload) => {
        const prompt = payload as SuspendPrompt;
        suspended = true;
        collector.suspended = { toolId: base.id, prompt };
        action.summary = `perguntou: ${prompt.text.split("\n").pop()}`;
      });
      try {
        if (!base.execute) throw new AppError("TOOL_NOT_EXECUTABLE", `Tool ${base.id} sem execute`);
        const output: unknown = await base.execute(input, observed);
        action.durationMs = Date.now() - started;
        if (suspended) return { status: "awaiting_user", note: "A pergunta foi enviada ao funcionário; a execução continua quando ele responder." };
        action.status = "done";
        action.summary = spec.summarize?.(input, output);

        if (spec.requiresConfirmation) {
          const pending = output as PendingAction;
          collector.pending = pending;
          action.summary ??= `rascunho: ${pending.label}`;
          return awaitingConfirmation(pending);
        }
        if (output && typeof output === "object" && "startFlow" in output) {
          collector.startFlow = (output as { startFlow: TurnCollector["startFlow"] }).startFlow;
        }
        if (output && typeof output === "object" && "outcome" in output) {
          return applyOutcome((output as { outcome: FlowOutcome }).outcome, action, collector);
        }
        const parts = spec.toPayload?.(input, output);
        if (parts) collector.payload.push(...parts);
        const effects = spec.afterEffects?.(input, output);
        if (effects) collector.afterEffects.push(...effects);
        return spec.toModel ? spec.toModel(output) : output;
      } catch (e) {
        action.status = "error";
        action.durationMs = Date.now() - started;
        const code = e instanceof AppError ? e.code : "ERROR";
        const message = e instanceof Error ? e.message : String(e);
        action.summary = message;
        collector.notes.push(`${base.id}: ${code}`);
        return { error: code, message };
      } finally {
        if (!spec.hidden) {
          collector.actions.splice(position, 0, action);
          emit({ type: "action", action: { ...action } });
        }
      }
    },
  }) as Tool<any, any, any>;
}

/** Tool concluiu um chat-formulário (HITL): o rascunho, o payload e as ações sintéticas do resultado entram no turno. */
function applyOutcome(outcome: FlowOutcome, action: TraceAction, collector: TurnCollector): unknown {
  if (outcome.payload) collector.payload.push(...outcome.payload);
  if (outcome.trace?.actions) collector.actions.push(...outcome.trace.actions);
  if (outcome.trace?.notes) collector.notes.push(...outcome.trace.notes);
  if (outcome.pendingAction) {
    collector.pending = outcome.pendingAction;
    action.summary ??= `rascunho: ${outcome.pendingAction.label}`;
    return awaitingConfirmation(outcome.pendingAction, outcome.text);
  }
  return { status: "done", summary: outcome.text };
}

/** Tools internas, iguais para toda persona. */
function engineTools(collector: TurnCollector, opts: { hasPendingAction: boolean }): Record<string, ToolSpec> {
  const tools: Record<string, ToolSpec> = {
    suggestQuickReplies: {
      hidden: true,
      label: "sugeriu respostas rápidas",
      tool: createTool({
        id: "suggest-quick-replies",
        description: "Oferece até 4 opções curtas de resposta rápida (botões) para o funcionário escolher. Use quando houver caminhos claros (ex.: 'Abrir chamado', 'Falar com analista').",
        inputSchema: z.object({ options: z.array(z.string().min(1).max(40)).min(1).max(4) }),
        execute: async ({ options }) => {
          for (const label of options) collector.options.push({ id: slug(label), label });
          return { ok: true };
        },
      }),
    },
    reportDecision: {
      hidden: true,
      label: "registrou a decisão",
      tool: createTool({
        id: "report-decision",
        description: "OBRIGATÓRIA em toda resposta, como última chamada de tool antes do texto final: registra o que você entendeu, a ação tomada, o grau de segurança e o porquê. Fica visível ao funcionário e ao analista.",
        inputSchema: z.object({
          understanding: z.string().describe("O que o funcionário quer, em uma frase"),
          action: z.string().describe("Ação tomada nesta resposta, em uma frase"),
          confidence: z.enum(["alta", "media", "baixa"]),
          reasoning: z.string().describe("Por que essa ação, citando regras/dados usados"),
        }),
        execute: async (d) => {
          collector.decision = d;
          return { ok: true };
        },
      }),
    },
  };
  if (opts.hasPendingAction) {
    tools.confirmPendingAction = {
      hidden: true,
      label: "confirmou a ação pendente",
      tool: createTool({
        id: "confirm-pending-action",
        description: "Executa a ação que está aguardando confirmação (o rascunho atual). Use somente se o funcionário confirmou explicitamente em texto.",
        inputSchema: z.object({}),
        execute: async () => { collector.confirmPending = true; return { ok: true, note: "A ação será executada ao fim desta resposta." }; },
      }),
    };
    tools.cancelPendingAction = {
      hidden: true,
      label: "cancelou a ação pendente",
      tool: createTool({
        id: "cancel-pending-action",
        description: "Descarta o rascunho que está aguardando confirmação. Use se o funcionário desistiu ou quer recomeçar.",
        inputSchema: z.object({}),
        execute: async () => { collector.cancelPending = true; return { ok: true }; },
      }),
    };
  }
  return tools;
}
