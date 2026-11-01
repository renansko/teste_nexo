/**
 * Único ponto do front que conhece o contrato HTTP v1 do backend
 * (fonte canônica: docs/brain/functions/ChatApi.md). Mudou a API → ajustar só aqui.
 * @wiki docs/brain/conventions/FrontendUI.md
 */

// ---------- Tipos do contrato ----------

export type UserRole = "employee" | "analyst";
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  department: string;
  role: UserRole;
}

export type ConversationState = "agent" | "waiting_analyst" | "analyst" | "closed";
export interface Conversation {
  id: string;
  state: ConversationState;
  ticketId: string | null;
  userMessages: number;
  limit: number;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = "user" | "agent" | "analyst" | "system";

export type ActionStatus = "pending" | "done" | "error";
export interface TraceAction {
  id: string;
  tool: string;
  label: string;
  status: ActionStatus;
  summary?: string;
}
export interface Trace {
  source: "agent" | "flow" | "action" | "rule";
  actions: TraceAction[];
  decision?: { understanding: string; action: string; confidence: "alta" | "media" | "baixa"; reasoning: string };
  durationMs?: number;
}

export type TicketPriority = "critica" | "alta" | "media" | "baixa";
export interface TicketView {
  id: string;
  type: "INC" | "REQ";
  title: string;
  description: string;
  category: string;
  priority: TicketPriority;
  priorityLabel: string;
  status: string;
  statusLabel: string;
  affected: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  overdue: boolean;
  slaLabel: string;
  resolvedAt: string | null;
}
export interface TicketUpdate {
  id: number;
  authorRole: "employee" | "analyst" | "agent" | "system";
  text: string;
  createdAt: string;
}
export interface DraftTicket {
  title: string;
  description: string;
  type: "INC" | "REQ";
  category: string;
  priority: TicketPriority;
  priorityLabel: string;
  dueLabel: string;
  affected: string;
  related?: TicketView[];
}
export interface Option {
  id: string;
  label: string;
}
export interface Article {
  id: string;
  title: string;
  body: string;
}

export type PayloadPart =
  | { kind: "options"; data: Option[] }
  | { kind: "draft"; data: DraftTicket }
  | { kind: "tickets"; data: TicketView[] }
  | { kind: "ticket"; data: { ticket: TicketView; updates: TicketUpdate[] } }
  | { kind: "articles"; data: Article[] };

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  payload: PayloadPart[] | null;
  trace: Trace | null;
  createdAt: string;
}

// ---------- HTTP ----------

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message?: string,
  ) {
    super(message ?? code);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(String(body.error ?? "ERROR"), res.status, body.message);
  return body as T;
}

type RawMessage = Omit<ChatMessage, "id"> & { id: string | number };
const toMessage = (m: RawMessage): ChatMessage => ({ ...m, id: String(m.id), payload: m.payload ?? null, trace: m.trace ?? null });

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: SessionUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<unknown>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: SessionUser }>("/api/auth/me"),

  listConversations: () => request<Conversation[]>("/api/conversations"),
  createConversation: () => request<Conversation>("/api/conversations", { method: "POST", body: "{}" }),
  async getConversation(id: string) {
    const d = await request<{ conversation: Conversation; messages: RawMessage[] }>(`/api/conversations/${encodeURIComponent(id)}`);
    return { conversation: d.conversation, messages: d.messages.map(toMessage) };
  },
  async messagesAfter(id: string, afterId: string) {
    const d = await request<RawMessage[] | { messages: RawMessage[] }>(
      `/api/conversations/${encodeURIComponent(id)}/messages?after=${encodeURIComponent(afterId)}`,
    );
    return (Array.isArray(d) ? d : d.messages).map(toMessage);
  },
};

// ---------- SSE ----------

export type ChatEvent =
  | { type: "message.start" }
  | { type: "action"; data: TraceAction }
  | { type: "text.delta"; data: { delta: string } }
  | { type: "payload"; data: PayloadPart }
  | { type: "trace"; data: Trace }
  | { type: "conversation"; data: Partial<Conversation> }
  | { type: "message.end"; data: { message: RawMessage } }
  | { type: "error"; data: { code: string; message: string } };

export type SendInput = { text: string } | { optionId: string; text?: string };

/**
 * Envia uma mensagem e repassa os eventos SSE a `onEvent`.
 * Erros HTTP antes do stream viram ApiError (ex.: 409 CONVERSATION_CLOSED / MESSAGE_LIMIT).
 */
export async function streamMessage(conversationId: string, input: SendInput, onEvent: (e: ChatEvent) => void): Promise<void> {
  const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(input),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(String(body.error ?? "ERROR"), res.status, body.message);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, "");
      const event = parseBlock(block);
      if (event) onEvent(event);
    }
  }
}

function parseBlock(block: string): ChatEvent | null {
  let type = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (type === "message") return null;
  try {
    const parsed = data.length ? JSON.parse(data.join("\n")) : {};
    if (type === "message.end") return { type, data: { message: parsed.message } };
    return { type, data: parsed } as unknown as ChatEvent;
  } catch {
    return null;
  }
}

export { toMessage };
