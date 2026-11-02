import { route, type IdParams } from "@/lib/http";
import { AppError, notFound } from "@/lib/errors";
import { requireSession } from "@/engine/auth/token";
import { getConversation } from "@/services/conversations/conversationService";
import { markTyping } from "@/engine/conversation/presence";

export const runtime = "nodejs";

/** Analista está digitando: só quem assumiu a conversa. O funcionário vê no polling de mensagens. */
export const POST = route(async (req, { params }: IdParams) => {
  const { user } = requireSession(req, { role: "analyst" });
  const { id } = await params;
  const conv = getConversation(id);
  if (!conv) throw notFound("Conversa");
  if (conv.state !== "analyst" || conv.analystId !== user.id) throw new AppError("NOT_ASSIGNED", "Assuma a conversa antes de responder", 409);
  markTyping(conv.id, "analyst");
  return Response.json({ ok: true });
});
