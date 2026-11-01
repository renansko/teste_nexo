import { z } from "zod";
import { parseBody, route } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { getAssistant } from "@/engine/registry";
import { createConversation, lastMessage, listConversationsForEmployee } from "@/services/conversations/conversationService";
import { publicConversation } from "@/engine/conversation/view";

export const runtime = "nodejs";

/** Minhas conversas (mais recente primeiro), com a última mensagem para "continuar de onde parei". */
export const GET = route(async (req) => {
  const { user } = requireSession(req);
  const items = listConversationsForEmployee(user.id).map((c) => ({ ...publicConversation(c), lastMessage: lastMessage(c.id) ?? null }));
  return Response.json(items);
});

const body = z.object({ assistantId: z.string().optional() }).default({});

export const POST = route(async (req) => {
  const { user } = requireSession(req);
  const { assistantId } = req.headers.get("content-length") === "0" || !req.body ? { assistantId: undefined } : await parseBody(req, body);
  const assistant = getAssistant(assistantId ?? "nexo");
  const conv = createConversation({ assistantId: assistant.id, employeeId: user.id });
  return Response.json(publicConversation(conv), { status: 201 });
});
