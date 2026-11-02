import { route, type IdParams } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { AppError, notFound } from "@/lib/errors";
import { getConversation, listMessages } from "@/services/conversations/conversationService";
import { withRetry } from "@/services/tickets/legacyGateway";
import { employeeThread, employeeTickets, toAnalystItem } from "@/engine/conversation/analystView";
import type { TicketView } from "@/services/tickets/ticketService";
import { typingState } from "@/engine/conversation/presence";

export const runtime = "nodejs";

/**
 * Detalhe: histórico com traces, dados do funcionário, as outras conversas dele (`thread`, para o chat único do console)
 * e painel com os chamados dele.
 * O painel vem do sistema de chamados (legado, instável): com ele indisponível após retries, `tickets` é `null`
 * e a conversa carrega mesmo assim; o console repete a consulta no próximo polling.
 */
export const GET = route(async (req, { params }: IdParams) => {
  requireSession(req, { role: "analyst" });
  const { id } = await params;
  const conv = getConversation(id);
  if (!conv) throw notFound("Conversa");
  const thread = employeeThread(conv.employeeId, conv.id);
  const item = toAnalystItem(conv, thread.length + 1);
  let tickets: TicketView[] | null;
  try {
    tickets = (await withRetry(() => employeeTickets(conv.employeeId), { delaysMs: [300, 600] })).result;
  } catch (e) {
    if (!(e instanceof AppError) || e.code !== "TICKET_SERVICE_UNAVAILABLE") throw e;
    tickets = null;
  }
  return Response.json({ conversation: item, messages: listMessages(id), employee: item.employee, tickets, thread, typing: { employee: typingState(id).employee } });
});
