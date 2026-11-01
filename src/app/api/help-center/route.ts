import { route } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { listArticles, searchArticles } from "@/services/helpCenter/helpCenterService";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  requireSession(req);
  const q = new URL(req.url).searchParams.get("q");
  return Response.json(q ? searchArticles(q, 5).map((h) => ({ ...h.article, score: h.score })) : listArticles());
});
