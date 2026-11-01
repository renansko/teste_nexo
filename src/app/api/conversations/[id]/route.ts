import { z } from "zod";
import { handleAnalystAction } from "@/agent/handleMessage";
import { getConversation, listMessages } from "@/services/conversations";
export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  return Response.json({ conversation, messages: listMessages(id) });
}

const body = z.object({ action: z.enum(["reply", "close"]), message: z.string().optional() });

/** Ações do analista. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  try {
    return Response.json(handleAnalystAction(id, parsed.data.action, parsed.data.message));
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    return Response.json({ error: code }, { status: code === "NOT_FOUND" ? 404 : 400 });
  }
}
