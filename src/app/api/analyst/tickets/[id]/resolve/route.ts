import { z } from "zod";
import { parseBody, route, type IdParams } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { withRetry } from "@/services/tickets/legacyGateway";
import { resolveTicket, toView } from "@/services/tickets/ticketService";
import { rememberResolution } from "@/services/helpCenter/helpCenterService";
import { triedSourcesForTicket } from "@/services/helpCenter/feedbackService";

export const runtime = "nodejs";

const Body = z.object({ solution: z.string().trim().min(10).max(2000) });

/**
 * Analista resolve um chamado vivo com a solução em texto. Dois efeitos: atualização + status no sistema de chamados
 * (legado, com retry) e a memória de resolução (nossa base), que o agent passa a encontrar na central de ajuda.
 * Erros: 404 chamado inexistente, 409 TICKET_NOT_OPEN, 503 legado indisponível após retries.
 */
export const POST = route(async (req, { params }: IdParams) => {
  const { user } = requireSession(req, { role: "analyst" });
  const { id } = await params;
  const { solution } = await parseBody(req, Body);
  const now = new Date();
  const { result: ticket } = await withRetry(() => resolveTicket(id.trim().toUpperCase(), { analystId: user.id, solution }, now));
  const memory = rememberResolution({
    ticketId: ticket.id, type: ticket.type, category: ticket.category, title: ticket.title, solution,
    triedArticleIds: triedSourcesForTicket(ticket.id).map((s) => `${s.source}:${s.id}`),
    resolvedBy: user.id, resolvedAt: now.toISOString(),
  });
  return Response.json({ ticket: toView(ticket, now), memoryId: memory.id });
});
