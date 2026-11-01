/**
 * Persistência de conversas e mensagens. Não decide nada: o engine decide, este módulo grava.
 * @wiki docs/brain/entities/Conversation.md
 */
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { ConversationState, FlowState, MessageRole, Payload, PendingAction, SuspendedRun, Trace } from "@/engine/types";

export interface Conversation {
  id: string;
  assistantId: string;
  employeeId: string;
  analystId: string | null;
  state: ConversationState;
  ticketId: string | null;
  userMessageCount: number;
  activeFlow: FlowState | null;
  pendingAction: PendingAction | null;
  /** Run do agent parada numa pergunta ao funcionário (HITL). */
  suspendedRun: SuspendedRun | null;
  transferReason: string | null;
  transferSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: number;
  conversationId: string;
  role: MessageRole;
  content: string;
  payload: Payload | null;
  trace: Trace | null;
  createdAt: string;
}

interface ConvRow {
  id: string; assistant_id: string; employee_id: string; analyst_id: string | null; state: ConversationState;
  ticket_id: string | null; user_message_count: number; active_flow: string | null; pending_action: string | null;
  suspended_run: string | null; transfer_reason: string | null; transfer_summary: string | null; created_at: string; updated_at: string;
}
interface MsgRow { id: number; conversation_id: string; role: MessageRole; content: string; payload: string | null; trace: string | null; created_at: string }

const parse = <T>(s: string | null): T | null => (s === null ? null : (JSON.parse(s) as T));

const toConversation = (r: ConvRow): Conversation => ({
  id: r.id, assistantId: r.assistant_id, employeeId: r.employee_id, analystId: r.analyst_id, state: r.state,
  ticketId: r.ticket_id, userMessageCount: r.user_message_count, activeFlow: parse<FlowState>(r.active_flow),
  pendingAction: parse<PendingAction>(r.pending_action), suspendedRun: parse<SuspendedRun>(r.suspended_run), transferReason: r.transfer_reason,
  transferSummary: r.transfer_summary, createdAt: r.created_at, updatedAt: r.updated_at,
});

const toMessage = (r: MsgRow): Message => ({
  id: r.id, conversationId: r.conversation_id, role: r.role, content: r.content,
  payload: parse<Payload>(r.payload), trace: parse<Trace>(r.trace), createdAt: r.created_at,
});

export function createConversation(input: { assistantId: string; employeeId: string }, now = new Date()): Conversation {
  const id = randomUUID();
  const iso = now.toISOString();
  getDb().prepare(
    `INSERT INTO conversations (id, assistant_id, employee_id, state, user_message_count, created_at, updated_at) VALUES (?,?,?,'agent',0,?,?)`,
  ).run(id, input.assistantId, input.employeeId, iso, iso);
  return getConversation(id)!;
}

export function getConversation(id: string): Conversation | undefined {
  const r = getDb().prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as ConvRow | undefined;
  return r && toConversation(r);
}

export function listConversationsForEmployee(employeeId: string): Conversation[] {
  const rows = getDb().prepare(`SELECT * FROM conversations WHERE employee_id = ? ORDER BY updated_at DESC`).all(employeeId) as unknown as ConvRow[];
  return rows.map(toConversation);
}

export function listConversations(filter: { state?: ConversationState; states?: ConversationState[] } = {}): Conversation[] {
  const states = filter.states ?? (filter.state ? [filter.state] : []);
  const where = states.length ? `WHERE state IN (${states.map(() => "?").join(",")})` : "";
  const rows = getDb().prepare(`SELECT * FROM conversations ${where} ORDER BY updated_at DESC`).all(...states) as unknown as ConvRow[];
  return rows.map(toConversation);
}

export type ConversationPatch = Partial<Pick<Conversation, "state" | "analystId" | "ticketId" | "activeFlow" | "pendingAction" | "suspendedRun" | "transferReason" | "transferSummary">>;

const COLUMN: Record<keyof ConversationPatch, string> = {
  state: "state", analystId: "analyst_id", ticketId: "ticket_id", activeFlow: "active_flow",
  pendingAction: "pending_action", suspendedRun: "suspended_run", transferReason: "transfer_reason", transferSummary: "transfer_summary",
};

export function updateConversation(id: string, patch: ConversationPatch, now = new Date()): Conversation {
  const sets: string[] = ["updated_at = ?"];
  const args: (string | null)[] = [now.toISOString()];
  for (const [k, v] of Object.entries(patch) as [keyof ConversationPatch, unknown][]) {
    sets.push(`${COLUMN[k]} = ?`);
    args.push(v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v));
  }
  getDb().prepare(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ?`).run(...args, id);
  return getConversation(id)!;
}

export function addMessage(
  conversationId: string,
  m: { role: MessageRole; content: string; payload?: Payload | null; trace?: Trace | null },
  now = new Date(),
): Message {
  const iso = now.toISOString();
  const db = getDb();
  const r = db.prepare(`INSERT INTO messages (conversation_id, role, content, payload, trace, created_at) VALUES (?,?,?,?,?,?)`).run(
    conversationId, m.role, m.content, m.payload?.length ? JSON.stringify(m.payload) : null, m.trace ? JSON.stringify(m.trace) : null, iso,
  );
  const counter = m.role === "user" ? ", user_message_count = user_message_count + 1" : "";
  db.prepare(`UPDATE conversations SET updated_at = ?${counter} WHERE id = ?`).run(iso, conversationId);
  return getMessage(Number(r.lastInsertRowid))!;
}

export function getMessage(id: number): Message | undefined {
  const r = getDb().prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as MsgRow | undefined;
  return r && toMessage(r);
}

export function listMessages(conversationId: string, opts: { after?: number; limit?: number } = {}): Message[] {
  const rows = getDb()
    .prepare(`SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id ${opts.limit ? `LIMIT ${Number(opts.limit)}` : ""}`)
    .all(conversationId, opts.after ?? 0) as unknown as MsgRow[];
  return rows.map(toMessage);
}

export function lastMessage(conversationId: string): Message | undefined {
  const r = getDb().prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1`).get(conversationId) as MsgRow | undefined;
  return r && toMessage(r);
}
