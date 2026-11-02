/**
 * Ganchos da persona: mantêm o chamado vinculado à conversa em sincronia com quem está cuidando dela
 * ("transferir chamados" do sistema simulado, item 4 do PRD).
 *   conversa transferida  → chamado vivo passa a `aguardando_analista`
 *   analista assumiu      → chamado `aberto` ou `aguardando_analista` passa a `em_atendimento`
 * Devolver ao agent e encerrar não mexem no chamado: o analista decide o desfecho dele no sistema de chamados.
 * Best-effort: o engine engole falhas (ex.: legado indisponível); a transição da conversa nunca depende disto.
 * @wiki docs/brain/entities/Ticket.md
 */
import type { AssistantHooks } from "@/engine/types";
import { getTicket, updateTicketStatus } from "@/services/tickets/ticketService";
import type { TicketStatus } from "@/services/tickets/types";

function moveTicket(ticketId: string | null, from: readonly TicketStatus[], to: TicketStatus, now: Date): void {
  if (!ticketId) return;
  const t = getTicket(ticketId);
  if (t && from.includes(t.status)) updateTicketStatus(t.id, to, now);
}

export const nexoHooks: AssistantHooks = {
  onTransferred: (conv, { now }) => moveTicket(conv.ticketId, ["aberto", "em_atendimento"], "aguardando_analista", now),
  onTaken: (conv, { now }) => moveTicket(conv.ticketId, ["aberto", "aguardando_analista"], "em_atendimento", now),
};
