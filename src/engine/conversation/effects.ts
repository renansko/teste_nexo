/**
 * Efeitos colaterais de uma ação concluída, compartilhados pelo turno e pela fila de ações.
 * @wiki docs/brain/functions/Turn.md
 */
import { addMessage, getConversation, updateConversation, type Message } from "@/services/conversations/conversationService";
import { linkTicket } from "@/services/helpCenter/feedbackService";
import { getAssistant } from "../registry";
import type { AfterEffect, AssistantHooks, QuickOption } from "../types";

export const ANALYST_OPTION: QuickOption = { id: "falar-com-um-analista", label: "Falar com um analista" };

/** Dispara um gancho da persona sem deixar exceção escapar: a transição já foi gravada e não depende dele. */
export function runHook<K extends keyof AssistantHooks>(assistantId: string, name: K, ...args: Parameters<NonNullable<AssistantHooks[K]>>): void {
  try {
    const hook = getAssistant(assistantId).hooks?.[name] as ((...a: unknown[]) => void) | undefined;
    hook?.(...args);
  } catch (e) {
    console.warn(`[hooks] ${name} falhou (ignorado):`, e instanceof Error ? e.message : e);
  }
}

/** Aplica transferência / vínculo de chamado. Devolve as mensagens de sistema criadas. */
export function applyAfterEffects(conversationId: string, effects: AfterEffect[], now: Date): Message[] {
  const out: Message[] = [];
  for (const e of effects) {
    if (e.type === "transfer") {
      const conv = getConversation(conversationId)!;
      if (conv.state !== "agent") continue;
      const updated = updateConversation(conversationId, { state: "waiting_analyst", transferReason: e.reason, transferSummary: e.summary }, now);
      out.push(addMessage(conversationId, { role: "system", content: `Conversa transferida para um analista. Motivo: ${e.label ?? e.reason}. Resumo: ${e.summary}` }));
      runHook(conv.assistantId, "onTransferred", { id: updated.id, employeeId: updated.employeeId, ticketId: updated.ticketId }, { reason: e.reason, now });
    } else if (e.type === "link-ticket") {
      updateConversation(conversationId, { ticketId: e.ticketId }, now);
      // Sugestões da central feitas nesta conversa passam a apontar para o chamado (trilha "artigo tentado → chamado").
      linkTicket(conversationId, e.ticketId);
    }
  }
  return out;
}
