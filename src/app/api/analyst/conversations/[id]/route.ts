import { route, type IdParams } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { notFound } from "@/lib/errors";
import { getConversation, listMessages } from "@/services/conversations/conversationService";
import { employeeTickets, toAnalystItem } from "@/engine/conversation/analystView";

export const runtime = "nodejs";

/** Detalhe: histórico com traces, dados do funcionário e painel com os chamados dele. */
export const GET = route(async (req, { params }: IdParams) => {
  requireSession(req, { role: "analyst" });
  const { id } = await params;
  const conv = getConversation(id);
  if (!conv) throw notFound("Conversa");
  const item = toAnalystItem(conv);
  return Response.json({ conversation: item, messages: listMessages(id), employee: item.employee, tickets: employeeTickets(conv.employeeId) });
});
