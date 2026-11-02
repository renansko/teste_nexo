/**
 * Projeções do console do analista: lista com filtros e detalhe com chamados do funcionário.
 * O console trabalha por funcionário: várias conversas da mesma pessoa viram um único item (a conversa "ativa")
 * e, no detalhe, um único chat com as demais conversas em ordem cronológica (`thread`).
 * @wiki docs/brain/functions/AnalystConsoleApi.md
 */
import { getEmployee, type Employee } from "@/services/employees/employeeService";
import {
  lastMessage, listConversations, listConversationsForEmployee, listMessages, type Conversation, type Message,
} from "@/services/conversations/conversationService";
import { listTickets, toView, type TicketView } from "@/services/tickets/ticketService";
import type { ConversationState } from "../types";
import { publicConversation, type PublicConversation } from "./view";

export interface AnalystConversationItem extends PublicConversation {
  employee: Pick<Employee, "id" | "name" | "email" | "department"> | null;
  analyst: Pick<Employee, "id" | "name"> | null;
  lastMessage: Message | null;
  /** Desde quando aguarda um analista (estado waiting_analyst). */
  waitingSince: string | null;
  /** Quantas conversas o funcionário tem no total (esta incluída): a lista mostra só a ativa. */
  threadSize: number;
}

/** Uma conversa do funcionário além da aberta no console, com as mensagens, para o chat único. */
export interface ThreadSegment {
  conversation: PublicConversation;
  messages: Message[];
}

const pick = (e: Employee | undefined) => (e ? { id: e.id, name: e.name, email: e.email, department: e.department } : null);

export function toAnalystItem(c: Conversation, threadSize = 1): AnalystConversationItem {
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
    threadSize,
  };
}

const ORDER: Record<ConversationState, number> = { waiting_analyst: 0, analyst: 1, agent: 2, closed: 3 };

const byPriority = (a: Conversation, b: Conversation) => ORDER[a.state] - ORDER[b.state] || b.updatedAt.localeCompare(a.updatedAt);

/**
 * Conversa ativa de um funcionário: a que mais precisa do analista (aguardando > em atendimento > com o agent > encerrada)
 * e, no empate, a mais recente. É a que a lista mostra e a que recebe as ações do console.
 */
export function activeConversation(convs: Conversation[]): Conversation | undefined {
  return [...convs].sort(byPriority)[0];
}

/** Um item por funcionário (a conversa ativa); `state` e `q` filtram sobre o item, `q` também sobre os chamados das outras conversas. */
export function listForAnalyst(filter: { state?: ConversationState; q?: string }): AnalystConversationItem[] {
  const q = filter.q?.trim().toLowerCase();
  const byEmployee = new Map<string, Conversation[]>();
  for (const c of listConversations()) byEmployee.set(c.employeeId, [...(byEmployee.get(c.employeeId) ?? []), c]);
  const items: AnalystConversationItem[] = [];
  for (const convs of byEmployee.values()) {
    const active = activeConversation(convs)!;
    if (filter.state && active.state !== filter.state) continue;
    const item = toAnalystItem(active, convs.length);
    const haystack = [item.employee?.name, item.employee?.email, item.transferSummary, item.lastMessage?.content, ...convs.map((c) => c.ticketId)];
    if (q && !haystack.some((v) => v?.toLowerCase().includes(q))) continue;
    items.push(item);
  }
  return items.sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.updatedAt.localeCompare(a.updatedAt));
}

/** As outras conversas do funcionário (sem a `exceptId`), da mais antiga para a mais nova, com mensagens. */
export function employeeThread(employeeId: string, exceptId: string): ThreadSegment[] {
  return listConversationsForEmployee(employeeId)
    .filter((c) => c.id !== exceptId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c) => ({ conversation: publicConversation(c), messages: listMessages(c.id) }));
}

export function employeeTickets(employeeId: string, now = new Date()): TicketView[] {
  return listTickets({ requesterId: employeeId }).map((t) => toView(t, now));
}
