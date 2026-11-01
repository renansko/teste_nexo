/** Helpers da camada HTTP: parse com zod, erros de domínio → status, cabeçalhos. */
import type { ZodType } from "zod";
import { AppError } from "./errors";
import { boot } from "./bootstrap";

/** Lê e valida o corpo JSON. Corpo vazio vira `{}` (útil para POSTs sem parâmetros). */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const text = await req.text().catch(() => "");
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AppError("INVALID_BODY", "JSON inválido", 400);
    }
    // Sem content-length o Next entrega "null" para POST sem corpo; trate como vazio.
    if (raw === null) raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AppError("INVALID_BODY", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
  return parsed.data;
}

export function errorResponse(e: unknown): Response {
  if (e instanceof AppError) {
    return Response.json({ error: e.code, message: e.message, details: e.details }, { status: e.status });
  }
  console.error(e);
  return Response.json({ error: "INTERNAL", message: "Erro interno" }, { status: 500 });
}

/** Envolve um handler: boot idempotente + conversão de erros. */
export function route<Ctx>(handler: (req: Request, ctx: Ctx) => Promise<Response> | Response) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      boot();
      return await handler(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export type IdParams = { params: Promise<{ id: string }> };

export const wantsEventStream = (req: Request): boolean => (req.headers.get("accept") ?? "").includes("text/event-stream");
