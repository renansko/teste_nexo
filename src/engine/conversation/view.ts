/** Projeções públicas: o que o cliente recebe de uma conversa (sem internals como pendingAction.input). */
import type { Conversation } from "@/services/conversations/conversationService";
import { getAssistant } from "@/engine/registry";
import { AppError } from "@/lib/errors";

export interface PublicConversation {
  id: string;
  assistantId: string;
  employeeId: string;
  analystId: string | null;
  state: Conversation["state"];
  ticketId: string | null;
  userMessages: number;
  limit: number;
  activeFlowId: string | null;
  /** Tool que suspendeu a run do agent aguardando resposta do funcionário (HITL). */
  suspendedTool: string | null;
  hasPendingAction: boolean;
  transferReason: string | null;
  transferSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export function publicConversation(c: Conversation): PublicConversation {
  return {
    id: c.id, assistantId: c.assistantId, employeeId: c.employeeId, analystId: c.analystId, state: c.state, ticketId: c.ticketId,
    userMessages: c.userMessageCount, limit: getAssistant(c.assistantId).limits.maxUserMessages,
    activeFlowId: c.activeFlow?.flowId ?? null, suspendedTool: c.suspendedRun?.toolId ?? null, hasPendingAction: !!c.pendingAction,
    transferReason: c.transferReason, transferSummary: c.transferSummary, createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
}

/** Garante que a conversa existe e pertence ao funcionário (ou que quem pede é analista). */
export function assertConversationAccess(c: Conversation | undefined, user: { id: string; role: "employee" | "analyst" }): Conversation {
  if (!c || (user.role !== "analyst" && c.employeeId !== user.id)) throw new AppError("NOT_FOUND", "Conversa não encontrada", 404);
  return c;
}
