import { z } from "zod";
import { handleUserMessage } from "@/agent/handleMessage";

export const runtime = "nodejs";
const body = z.object({ conversationId: z.string().optional(), message: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  try {
    return Response.json(await handleUserMessage(parsed.data));
  } catch (e) {
    const code = e instanceof Error ? e.message : "ERROR";
    return Response.json({ error: code }, { status: code === "CONVERSATION_CLOSED" ? 409 : 500 });
  }
}
