/** Acesso ao contexto por requisição dentro das tools (quem está logado, qual conversa). */
import type { ToolExecutionContext } from "@mastra/core/tools";
import { AppError } from "@/lib/errors";

export function currentUserId(context: ToolExecutionContext): string {
  const id = context.requestContext?.get("userId");
  if (typeof id !== "string" || !id) throw new AppError("NO_USER_CONTEXT", "Tool executada sem usuário", 500);
  return id;
}
