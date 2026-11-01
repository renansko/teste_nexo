import { route, type IdParams } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { getConversation, listMessages } from "@/services/conversations/conversationService";
import { assertConversationAccess, publicConversation } from "@/engine/conversation/view";

export const runtime = "nodejs";

/** Polling incremental: mensagens com id > `after` (respostas do analista, mensagens de sistema). */
export const GET = route(async (req, { params }: IdParams) => {
  const { user } = requireSession(req);
  const { id } = await params;
  const conv = assertConversationAccess(getConversation(id), user);
  const after = Number(new URL(req.url).searchParams.get("after") ?? "0");
  return Response.json({ conversation: publicConversation(conv), messages: listMessages(id, { after: Number.isFinite(after) ? after : 0 }) });
});
