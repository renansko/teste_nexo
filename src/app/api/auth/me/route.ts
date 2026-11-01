import { route } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";

export const runtime = "nodejs";

export const GET = route(async (req) => Response.json({ user: requireSession(req).user }));
