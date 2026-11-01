/**
 * Efeitos colaterais de uma ação concluída, compartilhados pelo turno e pela fila de ações.
 * @wiki docs/brain/functions/Turn.md
 */
import { addMessage, getConversation, updateConversation, type Message } from "@/services/conversations/conversationService";
import type { AfterEffect, QuickOption } from "../types";

export const ANALYST_OPTION: QuickOption = { id: "falar-com-um-analista", label: "Falar com um analista" };

/** Aplica transferência / vínculo de chamado. Devolve as mensagens de sistema criadas. */
export function applyAfterEffects(conversationId: string, effects: AfterEffect[], now: Date): Message[] {
  const out: Message[] = [];
  for (const e of effects) {
    if (e.type === "transfer") {
      const conv = getConversation(conversationId)!;
      if (conv.state !== "agent") continue;
      updateConversation(conversationId, { state: "waiting_analyst", transferReason: e.reason, transferSummary: e.summary }, now);
      out.push(addMessage(conversationId, { role: "system", content: `Conversa transferida para um analista. Motivo: ${e.label ?? e.reason}. Resumo: ${e.summary}` }));
    } else if (e.type === "link-ticket") {
      updateConversation(conversationId, { ticketId: e.ticketId }, now);
    }
  }
  return out;
}
