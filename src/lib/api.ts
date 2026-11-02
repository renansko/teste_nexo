/**
 * Único ponto do front que conhece o contrato HTTP v1 do backend
 * (fonte canônica: docs/brain/functions/ChatApi.md). Mudou a API → ajustar só aqui.
 * @wiki docs/brain/conventions/FrontendUI.md
 */
import type { PublicInputPolicy } from "@/engine/conversation/inputGuard";

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
  employeeId: string;
  analystId: string | null;
  userMessages: number;
  limit: number;
  /** Código do motivo da transferência (user_request, critical, overdue, low_confidence). */
  transferReason: string | null;
  transferSummary: string | null;
  /** Política de validação do texto livre (a mesma regra do servidor); o composer bloqueia antes de enviar. */
  inputPolicy?: PublicInputPolicy;
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
  /** Passo interno (busca na central): não entra na linha de status do chat. */
  quiet?: true;
}
export type Confidence = "alta" | "media" | "baixa";
export interface Decision {
  understanding: string;
  action: string;
  confidence: Confidence;
  reasoning: string;
}
export interface Trace {
  source: "agent" | "flow" | "action" | "rule";
  actions: TraceAction[];
  decision?: Decision;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number; cachedInputTokens?: number };
  durationMs?: number;
  notes?: string[];
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
  /** create = chamado novo; update = complemento num aberto; reopen = reabrir resolvido. */
  mode: "create" | "update" | "reopen";
  title: string;
  description: string;
  type: "INC" | "REQ";
  typeLabel: string;
  category: string;
  priority: TicketPriority;
  priorityLabel: string;
  priorityReason: string;
  slaLabel: string;
  dueAt: string;
  affected: string;
  /** Chamado alvo quando mode é update/reopen. */
  ticket?: TicketView;
  /** Complemento (update) ou motivo (reopen). */
  text?: string;
  related: TicketView[];
}
export interface Option {
  id: string;
  label: string;
}
export interface Article {
  id: string;
  title: string;
  body: string;
  /** Artigo da central (padrão) ou solução de um caso já resolvido por um analista. */
  source?: "article" | "resolution";
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
  /** Polling incremental: estado atual, mensagens com id > afterId e se o analista está digitando. */
  async messagesAfter(id: string, afterId: string) {
    const d = await request<{ conversation: Conversation; messages: RawMessage[]; typing?: { analyst: boolean } }>(
      `/api/conversations/${encodeURIComponent(id)}/messages?after=${encodeURIComponent(afterId)}`,
    );
    return { conversation: d.conversation, messages: d.messages.map(toMessage), analystTyping: d.typing?.analyst ?? false };
  },
  /** Avisa que o funcionário está digitando (reenviar a cada ~1,5 s enquanto digita). */
  typing: (id: string) => request<{ ok: true }>(`/api/conversations/${encodeURIComponent(id)}/typing`, { method: "POST", body: "{}" }),
};

// ---------- Console do analista (docs/brain/functions/AnalystConsoleApi.md) ----------

export interface AnalystConversation extends Conversation {
  employee: Pick<SessionUser, "id" | "name" | "email" | "department"> | null;
  analyst: { id: string; name: string } | null;
  lastMessage: (Omit<ChatMessage, "id"> & { id: string | number }) | null;
  /** Desde quando aguarda um analista (só em waiting_analyst). */
  waitingSince: string | null;
  /** Conversas do funcionário no total (a lista mostra uma por funcionário: a ativa). */
  threadSize: number;
}
/** Outra conversa do mesmo funcionário, mostrada no mesmo chat do console. */
export interface ThreadSegment {
  conversation: Conversation;
  messages: ChatMessage[];
}
export interface AnalystConversationDetail {
  conversation: AnalystConversation;
  messages: ChatMessage[];
  /** `null`: sistema de chamados indisponível no momento (a conversa carrega mesmo assim; o polling tenta de novo). */
  tickets: TicketView[] | null;
  /** As demais conversas do funcionário, da mais antiga para a mais nova (sem a `conversation`). */
  thread: ThreadSegment[];
  /** Funcionário está digitando agora (presença efêmera, vem com o polling). */
  employeeTyping: boolean;
}

type AnalystMutation = { conversation: AnalystConversation; messages: RawMessage[] };
const analystPath = (id: string, action = "") => `/api/analyst/conversations/${encodeURIComponent(id)}${action}`;
const mutate = async (id: string, action: string, body = "{}") => {
  const d = await request<AnalystMutation>(analystPath(id, action), { method: "POST", body });
  return { conversation: d.conversation, messages: d.messages.map(toMessage) };
};

export const analystApi = {
  list: (q?: string) => request<AnalystConversation[]>(`/api/analyst/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  async get(id: string): Promise<AnalystConversationDetail> {
    const d = await request<{
      conversation: AnalystConversation; messages: RawMessage[]; tickets: TicketView[] | null; typing?: { employee: boolean };
      thread?: { conversation: Conversation; messages: RawMessage[] }[];
    }>(analystPath(id));
    return {
      conversation: d.conversation, messages: d.messages.map(toMessage), tickets: d.tickets,
      thread: (d.thread ?? []).map((t) => ({ conversation: t.conversation, messages: t.messages.map(toMessage) })),
      employeeTyping: d.typing?.employee ?? false,
    };
  },
  /** Avisa que o analista está digitando (só quem assumiu; reenviar a cada ~1,5 s). */
  typing: (id: string) => request<{ ok: true }>(analystPath(id, "/typing"), { method: "POST", body: "{}" }),
  take: (id: string) => mutate(id, "/take"),
  reply: (id: string, text: string) => mutate(id, "/messages", JSON.stringify({ text })),
  giveBack: (id: string) => mutate(id, "/return"),
  close: (id: string) => mutate(id, "/close"),
  /** Resolve um chamado vivo com a solução em texto; ela vira memória pesquisável pelo agent. */
  resolveTicket: (ticketId: string, solution: string) =>
    request<{ ticket: TicketView; memoryId: string }>(`/api/analyst/tickets/${encodeURIComponent(ticketId)}/resolve`, { method: "POST", body: JSON.stringify({ solution }) }),
  /** Acertos e erros das sugestões da central por artigo/solução. */
  helpMetrics: () => request<HelpMetric[]>("/api/analyst/help-center/metrics"),
};

export interface HelpMetric {
  source: "article" | "resolution";
  sourceId: string;
  title: string | null;
  shown: number;
  resolved: number;
  notResolved: number;
  analyst: number;
  unclear: number;
  pending: number;
  resolutionRate: number | null;
}

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
