import { route, type IdParams } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { notFound } from "@/lib/errors";
import { getTicketForRequester, listUpdates, toView } from "@/services/tickets/ticketService";

export const runtime = "nodejs";

export const GET = route(async (req, { params }: IdParams) => {
  const { user } = requireSession(req);
  const { id } = await params;
  const ticket = getTicketForRequester(id, user.id);
  if (!ticket) throw notFound("Chamado");
  return Response.json({ ticket: toView(ticket), updates: listUpdates(ticket.id) });
});
