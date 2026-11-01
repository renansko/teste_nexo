import { route } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { listTickets, toView } from "@/services/tickets/ticketService";
import { withRetry } from "@/services/tickets/legacyGateway";

export const runtime = "nodejs";

/** Meus chamados (privacidade: só os do próprio funcionário). Repete na indisponibilidade do legado, como as tools. */
export const GET = route(async (req) => {
  const { user } = requireSession(req);
  const open = new URL(req.url).searchParams.get("open");
  const { result: tickets } = await withRetry(() => listTickets({ requesterId: user.id, open: open === null ? undefined : open === "true" }));
  return Response.json(tickets.map((t) => toView(t)));
});
