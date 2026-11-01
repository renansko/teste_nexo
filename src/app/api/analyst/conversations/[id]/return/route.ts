import { route, type IdParams } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { returnToAgent } from "@/engine/conversation/state";
import { toAnalystItem } from "@/engine/conversation/analystView";

export const runtime = "nodejs";

export const POST = route(async (req, { params }: IdParams) => {
  const { user } = requireSession(req, { role: "analyst" });
  const { id } = await params;
  const r = returnToAgent(id, user);
  return Response.json({ conversation: toAnalystItem(r.conversation), messages: r.messages });
});
