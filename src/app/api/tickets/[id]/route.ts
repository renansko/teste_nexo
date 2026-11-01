import { route, type IdParams } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { notFound } from "@/lib/errors";
import { getTicketForRequester, listUpdates, toView } from "@/services/tickets/ticketService";
import { withRetry } from "@/services/tickets/legacyGateway";

export const runtime = "nodejs";

export const GET = route(async (req, { params }: IdParams) => {
  const { user } = requireSession(req);
  const { id } = await params;
  const { result } = await withRetry(() => {
    const ticket = getTicketForRequester(id, user.id);
    return ticket ? { ticket: toView(ticket), updates: listUpdates(ticket.id) } : undefined;
  });
  if (!result) throw notFound("Chamado");
  return Response.json(result);
});
