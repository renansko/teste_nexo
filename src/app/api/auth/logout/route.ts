import { route } from "@/lib/http";
import { sessionCookie } from "@/engine/auth/token";

export const runtime = "nodejs";

export const POST = route(async () => Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(null) } }));
