/**
 * FlowRunner: chat-formulário determinístico. Faz perguntas na ordem, valida, pula o que já está preenchido
 * e chama `onComplete` no fim. Não usa LLM. O estado vive em `conversations.active_flow`.
 * @wiki docs/brain/services/FlowEngine.md
 */
import type { FlowContext, FlowData, FlowDefinition, FlowOutcome, FlowState, QuickOption, TurnInput } from "../types";

export const CANCEL_OPTION: QuickOption = { id: "cancel", label: "Cancelar" };
const CANCEL_TEXT = /^(cancelar?|cancela|desist[oi]r?|deixa (pra|para) l[áa])\.?$/i;

export interface FlowReply { text: string; options: QuickOption[] }

export type FlowStepResult =
  | { kind: "ask"; state: FlowState; reply: FlowReply }
  | { kind: "done"; outcome: FlowOutcome; data: FlowData }
  | { kind: "cancelled"; text: string };

const resolve = <T>(v: T | ((d: FlowData) => T), d: FlowData): T => (typeof v === "function" ? (v as (d: FlowData) => T)(d) : v);

function nextIndex(flow: FlowDefinition, data: FlowData, from: number): number {
  let i = from;
  while (i < flow.steps.length && flow.steps[i]!.skipIf?.(data)) i += 1;
  return i;
}

function question(flow: FlowDefinition, state: FlowState, prefix?: string): FlowReply {
  const step = flow.steps[state.stepIndex]!;
  const options = step.type === "choice" ? resolve(step.options ?? [], state.data) : [];
  return { text: `${prefix ? prefix + "\n\n" : ""}${resolve(step.prompt, state.data)}`, options: [...options, CANCEL_OPTION] };
}

export async function startFlow(flow: FlowDefinition, data: FlowData, ctx: FlowContext, intro?: string): Promise<FlowStepResult> {
  const state: FlowState = { flowId: flow.id, data: { ...data }, stepIndex: nextIndex(flow, data, 0), startedAt: ctx.now.toISOString() };
  if (state.stepIndex >= flow.steps.length) return { kind: "done", outcome: await flow.onComplete(state.data, ctx), data: state.data };
  return { kind: "ask", state, reply: question(flow, state, intro ?? resolve(flow.intro, state.data)) };
}

/** Reabre o flow num passo específico (ex.: "Editar prioridade" no rascunho), limpando a resposta anterior. */
export function resumeAtStep(flow: FlowDefinition, data: FlowData, stepKey: string, ctx: FlowContext): FlowStepResult | null {
  const idx = flow.steps.findIndex((s) => s.key === stepKey);
  if (idx < 0) return null;
  const next = { ...data };
  delete next[stepKey];
  const state: FlowState = { flowId: flow.id, data: next, stepIndex: idx, startedAt: ctx.now.toISOString() };
  return { kind: "ask", state, reply: question(flow, state) };
}

export async function advanceFlow(flow: FlowDefinition, state: FlowState, input: TurnInput, ctx: FlowContext): Promise<FlowStepResult> {
  const step = flow.steps[state.stepIndex];
  if (!step) return { kind: "done", outcome: await flow.onComplete(state.data, ctx), data: state.data };
  const text = input.text?.trim() ?? "";
  if (input.optionId === CANCEL_OPTION.id || CANCEL_TEXT.test(text)) {
    return { kind: "cancelled", text: flow.cancelText ?? "Ok, cancelei. Se quiser, é só me dizer o que precisa." };
  }

  let value: string | undefined;
  if (step.type === "choice") {
    const options = resolve(step.options ?? [], state.data);
    const byId = options.find((o) => o.id === input.optionId);
    const byLabel = options.find((o) => o.label.toLowerCase() === text.toLowerCase());
    const byNumber = /^\d+$/.test(text) ? options[Number(text) - 1] : undefined;
    value = (byId ?? byLabel ?? byNumber)?.id;
    if (!value) {
      const list = options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
      return { kind: "ask", state, reply: question(flow, state, `Não entendi. Escolha uma das opções:\n${list}`) };
    }
  } else {
    value = text || undefined;
    if (!value) return { kind: "ask", state, reply: question(flow, state, "Preciso dessa informação para continuar.") };
  }

  const error = step.validate?.(value, state.data);
  if (error) return { kind: "ask", state, reply: question(flow, state, error) };

  const data = { ...state.data, [step.key]: value };
  const stepIndex = nextIndex(flow, data, state.stepIndex + 1);
  if (stepIndex >= flow.steps.length) return { kind: "done", outcome: await flow.onComplete(data, ctx), data };
  const next: FlowState = { ...state, data, stepIndex };
  return { kind: "ask", state: next, reply: question(flow, next) };
}
