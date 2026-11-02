import { route } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { feedbackMetrics } from "@/services/helpCenter/feedbackService";
import { getKnowledge } from "@/services/helpCenter/helpCenterService";

export const runtime = "nodejs";

/** Acertos e erros das sugestões da central por artigo/solução (base para revisar a FAQ). */
export const GET = route(async (req) => {
  requireSession(req, { role: "analyst" });
  const rows = feedbackMetrics().map((m) => ({ ...m, title: getKnowledge(m.source, m.sourceId)?.title ?? null }));
  return Response.json(rows);
});
