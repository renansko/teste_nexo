import { route, type IdParams } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { requireSession } from "@/engine/auth/token";
import { getConversation } from "@/services/conversations/conversationService";
import { assertConversationAccess } from "@/engine/conversation/view";
import { markTyping } from "@/engine/conversation/presence";

export const runtime = "nodejs";

/** Funcionário está digitando (o cliente reenvia a cada ~1,5 s enquanto digita). O analista vê no polling do console. */
export const POST = route(async (req, { params }: IdParams) => {
  const { user } = requireSession(req, { role: "employee" });
  const { id } = await params;
  const conv = assertConversationAccess(getConversation(id), user);
  if (conv.state === "closed") throw new AppError("CONVERSATION_CLOSED", "Conversa encerrada", 409);
  markTyping(conv.id, "employee");
  return Response.json({ ok: true });
});
