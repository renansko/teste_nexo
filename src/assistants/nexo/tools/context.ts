/** Acesso ao contexto por requisição dentro das tools (quem está logado, qual conversa). */
import type { ToolExecutionContext } from "@mastra/core/tools";
import { AppError } from "@/lib/errors";

type AnyToolContext = Pick<ToolExecutionContext<any, any>, "requestContext">;

export function currentUserId(context: AnyToolContext): string {
  const id = context.requestContext?.get("userId");
  if (typeof id !== "string" || !id) throw new AppError("NO_USER_CONTEXT", "Tool executada sem usuário", 500);
  return id;
}

/** Contexto completo do turno (usuário, conversa, "agora"), no formato que flows e serviços esperam. */
export function turnContext(context: AnyToolContext): { userId: string; conversationId: string; now: Date } {
  const userId = currentUserId(context);
  const conversationId = context.requestContext?.get("conversationId");
  const now = context.requestContext?.get("now");
  return {
    userId,
    conversationId: typeof conversationId === "string" ? conversationId : "",
    now: typeof now === "string" ? new Date(now) : new Date(),
  };
}
