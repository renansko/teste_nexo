import { route } from "@/lib/http";
import { isSecureRequest, sessionCookie } from "@/engine/auth/token";

export const runtime = "nodejs";

export const POST = route(async (req) => Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(null, { secure: isSecureRequest(req) }) } }));
