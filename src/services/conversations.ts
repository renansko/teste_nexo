/**
 * Persistência de conversas, mensagens e estado (agent ↔ analista).
 * @wiki docs/brain/entities/Conversation.md
 */
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

export type ConversationState = "agent" | "waiting_analyst" | "analyst" | "closed";
export type Role = "user" | "agent" | "analyst";
export interface Message { id: number; role: Role; content: string; createdAt: string }
export interface Conversation { id: string; state: ConversationState; ticketId: string | null }

export function createConversation(): Conversation {
  const id = randomUUID();
  const now = new Date().toISOString();
  getDb().prepare(`INSERT INTO conversations VALUES (?,?,?,?,?)`).run(id, "agent", null, now, now);
  return { id, state: "agent", ticketId: null };
}

export function getConversation(id: string): Conversation | undefined {
  const r = getDb().prepare(`SELECT id, state, ticket_id FROM conversations WHERE id = ?`).get(id) as
    | { id: string; state: ConversationState; ticket_id: string | null } | undefined;
  return r && { id: r.id, state: r.state, ticketId: r.ticket_id };
}

export function listConversations(): Conversation[] {
  const rows = getDb().prepare(`SELECT id, state, ticket_id FROM conversations ORDER BY updated_at DESC`).all() as unknown as
    { id: string; state: ConversationState; ticket_id: string | null }[];
  return rows.map((r) => ({ id: r.id, state: r.state, ticketId: r.ticket_id }));
}

export function setState(id: string, state: ConversationState): void {
  getDb().prepare(`UPDATE conversations SET state = ?, updated_at = ? WHERE id = ?`).run(state, new Date().toISOString(), id);
}

export function linkTicket(id: string, ticketId: string): void {
  getDb().prepare(`UPDATE conversations SET ticket_id = ?, updated_at = ? WHERE id = ?`).run(ticketId, new Date().toISOString(), id);
}

export function addMessage(conversationId: string, role: Role, content: string): void {
  const now = new Date().toISOString();
  getDb().prepare(`INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?,?,?,?)`).run(conversationId, role, content, now);
  getDb().prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now, conversationId);
}

export function listMessages(conversationId: string): Message[] {
  const rows = getDb().prepare(`SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id`).all(conversationId) as unknown as
    { id: number; role: Role; content: string; created_at: string }[];
  return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.created_at }));
}
