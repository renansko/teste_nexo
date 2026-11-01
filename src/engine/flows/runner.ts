/**
 * FlowRunner: chat-formulário determinístico. Faz perguntas na ordem, valida, pula o que já está preenchido
 * e chama `onComplete` no fim. Não usa LLM. O estado vive em `conversations.active_flow`.
 * Os helpers exportados (`nextStepIndex`, `questionFor`, `answerStep`) também servem à tool HITL,
 * que percorre os mesmos passos dentro de uma run do agent suspensa.
 * @wiki docs/brain/services/FlowEngine.md
 */
import type { FlowContext, FlowData, FlowDefinition, FlowOutcome, FlowState, FlowStep, QuickOption, TurnInput } from "../types";

export const CANCEL_OPTION: QuickOption = { id: "cancel", label: "Cancelar" };
const CANCEL_TEXT = /^(cancelar?|cancela|desist[oi]r?|deixa (pra|para) l[áa])\.?$/i;

/** Entrada que cancela uma pergunta: opção `cancel` ou texto equivalente. */
export const isCancelInput = (input: TurnInput): boolean =>
  input.optionId === CANCEL_OPTION.id || CANCEL_TEXT.test(input.text?.trim() ?? "");

export interface FlowReply { text: string; options: QuickOption[] }

export type FlowStepResult =
  | { kind: "ask"; state: FlowState; reply: FlowReply }
  | { kind: "done"; outcome: FlowOutcome; data: FlowData }
  | { kind: "cancelled"; text: string };

const resolve = <T>(v: T | ((d: FlowData) => T), d: FlowData): T => (typeof v === "function" ? (v as (d: FlowData) => T)(d) : v);

/** Índice do próximo passo não pulado a partir de `from` (pode ser `steps.length` = concluído). */
export function nextStepIndex(flow: FlowDefinition, data: FlowData, from: number): number {
  let i = from;
  while (i < flow.steps.length && flow.steps[i]!.skipIf?.(data)) i += 1;
  return i;
}

/** Pergunta do passo `stepIndex` com suas opções e a opção de cancelar. */
export function questionFor(flow: FlowDefinition, data: FlowData, stepIndex: number, prefix?: string): FlowReply {
  const step = flow.steps[stepIndex]!;
  const options = step.type === "choice" ? resolve(step.options ?? [], data) : [];
  return { text: `${prefix ? prefix + "\n\n" : ""}${resolve(step.prompt, data)}`, options: [...options, CANCEL_OPTION] };
}

/** Interpreta a resposta do funcionário a um passo: opção por id/rótulo/número, texto livre, `validate`. */
export function answerStep(step: FlowStep, data: FlowData, input: TurnInput): { value: string } | { error: string } {
  const text = input.text?.trim() ?? "";
  if (step.type === "choice") {
    const options = resolve(step.options ?? [], data);
    const byId = options.find((o) => o.id === input.optionId);
    const byLabel = options.find((o) => o.label.toLowerCase() === text.toLowerCase());
    const byNumber = /^\d+$/.test(text) ? options[Number(text) - 1] : undefined;
    const value = (byId ?? byLabel ?? byNumber)?.id;
    if (!value) {
      const list = options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
      return { error: `Não entendi. Escolha uma das opções:\n${list}` };
    }
    const error = step.validate?.(value, data);
    return error ? { error } : { value };
  }
  if (!text) return { error: "Preciso dessa informação para continuar." };
  const error = step.validate?.(text, data);
  return error ? { error } : { value: text };
}

export async function startFlow(flow: FlowDefinition, data: FlowData, ctx: FlowContext, intro?: string): Promise<FlowStepResult> {
  const state: FlowState = { flowId: flow.id, data: { ...data }, stepIndex: nextStepIndex(flow, data, 0), startedAt: ctx.now.toISOString() };
  if (state.stepIndex >= flow.steps.length) return { kind: "done", outcome: await flow.onComplete(state.data, ctx), data: state.data };
  return { kind: "ask", state, reply: questionFor(flow, state.data, state.stepIndex, intro ?? resolve(flow.intro, state.data)) };
}

/** Reabre o flow num passo específico (ex.: "Editar prioridade" no rascunho), limpando a resposta anterior. */
export function resumeAtStep(flow: FlowDefinition, data: FlowData, stepKey: string, ctx: FlowContext): FlowStepResult | null {
  const idx = flow.steps.findIndex((s) => s.key === stepKey);
  if (idx < 0) return null;
  const next = { ...data };
  delete next[stepKey];
  const state: FlowState = { flowId: flow.id, data: next, stepIndex: idx, startedAt: ctx.now.toISOString() };
  return { kind: "ask", state, reply: questionFor(flow, state.data, state.stepIndex) };
}

export async function advanceFlow(flow: FlowDefinition, state: FlowState, input: TurnInput, ctx: FlowContext): Promise<FlowStepResult> {
  const step = flow.steps[state.stepIndex];
  if (!step) return { kind: "done", outcome: await flow.onComplete(state.data, ctx), data: state.data };
  if (isCancelInput(input)) {
    return { kind: "cancelled", text: flow.cancelText ?? "Ok, cancelei. Se quiser, é só me dizer o que precisa." };
  }

  const answer = answerStep(step, state.data, input);
  if ("error" in answer) return { kind: "ask", state, reply: questionFor(flow, state.data, state.stepIndex, answer.error) };

  const data = { ...state.data, [step.key]: answer.value };
  const stepIndex = nextStepIndex(flow, data, state.stepIndex + 1);
  if (stepIndex >= flow.steps.length) return { kind: "done", outcome: await flow.onComplete(data, ctx), data };
  const next: FlowState = { ...state, data, stepIndex };
  return { kind: "ask", state: next, reply: questionFor(flow, data, stepIndex) };
}
