/**
 * Ação pendente: nenhum efeito colateral (criar/atualizar/reabrir chamado) acontece sem confirmação explícita.
 * O rascunho vai ao cliente como payload `draft` + opções Confirmar / (editar...) / Cancelar.
 * @wiki docs/brain/services/PendingAction.md
 */
import { PAYLOAD_DRAFT, PAYLOAD_OPTIONS, type PayloadPart, type PendingAction, type QuickOption, type TurnInput } from "../types";

export const CONFIRM_OPTION: QuickOption = { id: "confirm", label: "Confirmar" };
export const CANCEL_OPTION: QuickOption = { id: "cancel", label: "Cancelar" };
export const EDIT_PREFIX = "edit:";

const CONFIRM_TEXT = /^(sim|confirmar?|confirmo|ok|pode (criar|abrir|atualizar|reabrir|enviar|mandar)|isso|correto|certo|perfeito)[.!]?$/i;
const CANCEL_TEXT = /^(n[ãa]o|cancelar?|cancela|desist[oi]r?|deixa (pra|para) l[áa])[.!]?$/i;

export function pendingParts(p: PendingAction): PayloadPart[] {
  return [
    { kind: PAYLOAD_DRAFT, data: p.draft },
    { kind: PAYLOAD_OPTIONS, data: [CONFIRM_OPTION, ...(p.extraOptions ?? []), CANCEL_OPTION] },
  ];
}

export type PendingIntent = { kind: "confirm" } | { kind: "cancel" } | { kind: "edit"; stepKey: string } | null;

/** Interpreta a entrada do usuário diante de um rascunho. Texto livre ambíguo → null (vai para o agent). */
export function interpretPendingInput(input: TurnInput): PendingIntent {
  const text = input.text?.trim() ?? "";
  if (input.optionId === CONFIRM_OPTION.id) return { kind: "confirm" };
  if (input.optionId === CANCEL_OPTION.id) return { kind: "cancel" };
  if (input.optionId?.startsWith(EDIT_PREFIX)) return { kind: "edit", stepKey: input.optionId.slice(EDIT_PREFIX.length) };
  if (!input.optionId && CONFIRM_TEXT.test(text)) return { kind: "confirm" };
  if (!input.optionId && CANCEL_TEXT.test(text)) return { kind: "cancel" };
  return null;
}
