import { route } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { listForAnalyst } from "@/engine/conversation/analystView";
import type { ConversationState } from "@/engine/types";

export const runtime = "nodejs";

const STATES: ConversationState[] = ["agent", "waiting_analyst", "analyst", "closed"];

/** Lista de conversas para o console: filtros por estado e busca por funcionário/chamado/resumo. */
export const GET = route(async (req) => {
  requireSession(req, { role: "analyst" });
  const params = new URL(req.url).searchParams;
  const state = params.get("state");
  const q = params.get("q") ?? undefined;
  return Response.json(listForAnalyst({ state: STATES.includes(state as ConversationState) ? (state as ConversationState) : undefined, q }));
});
