/** Projeções do console do analista: lista com filtros e detalhe com chamados do funcionário. */
import { getEmployee, type Employee } from "@/services/employees/employeeService";
import { lastMessage, listConversations, listMessages, type Conversation, type Message } from "@/services/conversations/conversationService";
import { listTickets, toView, type TicketView } from "@/services/tickets/ticketService";
import type { ConversationState } from "../types";
import { publicConversation, type PublicConversation } from "./view";

export interface AnalystConversationItem extends PublicConversation {
  employee: Pick<Employee, "id" | "name" | "email" | "department"> | null;
  analyst: Pick<Employee, "id" | "name"> | null;
  lastMessage: Message | null;
  /** Desde quando aguarda um analista (estado waiting_analyst). */
  waitingSince: string | null;
}

const pick = (e: Employee | undefined) => (e ? { id: e.id, name: e.name, email: e.email, department: e.department } : null);

export function toAnalystItem(c: Conversation): AnalystConversationItem {
  const analyst = c.analystId ? getEmployee(c.analystId) : undefined;
  const messages = listMessages(c.id);
  const transfer = c.state === "waiting_analyst" ? messages.find((m) => m.role === "system" && m.content.startsWith("Conversa transferida")) : undefined;
  return {
    ...publicConversation(c),
    employee: pick(getEmployee(c.employeeId)),
    analyst: analyst ? { id: analyst.id, name: analyst.name } : null,
    // Prévia da lista: a última fala (funcionário, agent ou analista); avisos de sistema só se não houver fala.
    lastMessage: [...messages].reverse().find((m) => m.role !== "system") ?? lastMessage(c.id) ?? null,
    waitingSince: c.state === "waiting_analyst" ? (transfer?.createdAt ?? c.updatedAt) : null,
  };
}

const ORDER: Record<ConversationState, number> = { waiting_analyst: 0, analyst: 1, agent: 2, closed: 3 };

export function listForAnalyst(filter: { state?: ConversationState; q?: string }): AnalystConversationItem[] {
  const q = filter.q?.trim().toLowerCase();
  return listConversations(filter.state ? { state: filter.state } : {})
    .map(toAnalystItem)
    .filter((i) => !q || [i.employee?.name, i.employee?.email, i.ticketId, i.transferSummary, i.lastMessage?.content].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.updatedAt.localeCompare(a.updatedAt));
}

export function employeeTickets(employeeId: string, now = new Date()): TicketView[] {
  return listTickets({ requesterId: employeeId }).map((t) => toView(t, now));
}
