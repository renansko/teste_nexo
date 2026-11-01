import { z } from "zod";
import { parseBody, route, type IdParams } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { analystReply } from "@/engine/conversation/state";
import { toAnalystItem } from "@/engine/conversation/analystView";

export const runtime = "nodejs";

const body = z.object({ text: z.string().min(1).max(4000) });

export const POST = route(async (req, { params }: IdParams) => {
  const { user } = requireSession(req, { role: "analyst" });
  const { id } = await params;
  const { text } = await parseBody(req, body);
  const r = analystReply(id, user, text);
  return Response.json({ conversation: toAnalystItem(r.conversation), messages: [r.message] });
});
