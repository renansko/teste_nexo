import { z } from "zod";
import { parseBody, route, wantsEventStream, type IdParams } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { getConversation, lastMessage, listMessages } from "@/services/conversations/conversationService";
import { assertConversationAccess, publicConversation } from "@/engine/conversation/view";
import { runTurn, turnAsEventStream } from "@/engine/conversation/turn";
import { typingState } from "@/engine/conversation/presence";
import { DEFAULT_INPUT_POLICY } from "@/engine/conversation/inputGuard";

export const runtime = "nodejs";

/**
 * Polling incremental: mensagens com id > `after` (respostas do analista, mensagens de sistema) e se o analista está digitando.
 * `ETag` resume o estado (conversa atualizada, última mensagem, digitando): com `If-None-Match` igual, responde 304 sem corpo,
 * sem montar a conversa nem as mensagens. É o caso comum (nada mudou) e o mais barato.
 */
export const GET = route(async (req, { params }: IdParams) => {
  const { user } = requireSession(req);
  const { id } = await params;
  const conv = assertConversationAccess(getConversation(id), user);
  const typing = typingState(id).analyst;
  const etag = `W/"${conv.updatedAt}|${lastMessage(id)?.id ?? 0}|${typing ? 1 : 0}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  const after = Number(new URL(req.url).searchParams.get("after") ?? "0");
  return Response.json(
    {
      conversation: publicConversation(conv),
      messages: listMessages(id, { after: Number.isFinite(after) ? after : 0 }),
      typing: { analyst: typing },
    },
    { headers: { ETag: etag } },
  );
});

// Teto HTTP fixo; a política da persona (`inputPolicy`) só pode ser mais restritiva e responde por regra, não com 400.
const body = z.object({ text: z.string().max(DEFAULT_INPUT_POLICY.maxChars).optional(), optionId: z.string().max(80).optional() })
  .refine((b) => (b.text?.trim() || b.optionId), { message: "informe text ou optionId" });

/**
 * Envia uma mensagem do funcionário. Com `Accept: text/event-stream` responde em SSE
 * (ações do agent, texto incremental, cards, trace); caso contrário, JSON com as mensagens produzidas.
 */
export const POST = route(async (req, { params }: IdParams) => {
  const { user } = requireSession(req, { role: "employee" });
  const { id } = await params;
  const input = await parseBody(req, body);
  if (wantsEventStream(req)) return turnAsEventStream({ conversationId: id, user, input });
  const result = await runTurn({ conversationId: id, user, input });
  return Response.json({ conversation: publicConversation(result.conversation), messages: result.messages });
});
