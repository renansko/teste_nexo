/** Rótulos e cores do console do analista (protótipo "Atendente — Conversas"). */
import type { AnalystConversation, AnalystConversationDetail, Confidence, PayloadPart, SessionUser } from "@/lib/api";
import { formatDay } from "@/lib/format";

export type Filter = "all" | "forYou" | "agent" | "mine";

export const FILTERS: { id: Filter; label: string; count: boolean }[] = [
  { id: "all", label: "Todas", count: false },
  { id: "forYou", label: "Para você", count: true },
  { id: "agent", label: "Com o agent", count: true },
  { id: "mine", label: "Minhas", count: true },
];

export function matchesFilter(c: AnalystConversation, f: Filter, me: SessionUser): boolean {
  switch (f) {
    case "all":
      return true;
    case "forYou":
      return c.state === "waiting_analyst";
    case "agent":
      return c.state === "agent";
    case "mine":
      return c.state === "analyst" && c.analystId === me.id;
  }
}

/** Motivo da transferência (código do backend → texto). */
export const REASON: Record<string, string> = {
  user_request: "pedido do funcionário",
  critical: "caso crítico",
  overdue: "chamado vencido",
  low_confidence: "agent sem segurança para decidir",
};
export const reasonLabel = (code: string | null) => (code ? (REASON[code] ?? code) : "motivo não informado");

export type TagTone = "danger" | "warning" | "primary" | "success" | "muted";

/** Etiqueta de status de cada conversa na lista. */
export function conversationTag(c: AnalystConversation, me: SessionUser): { tone: TagTone; label: string } {
  switch (c.state) {
    case "waiting_analyst":
      if (c.transferReason === "low_confidence") return { tone: "warning", label: "Agent pediu ajuda · segurança baixa" };
      return { tone: "danger", label: `Transferida · ${c.ticketId ?? reasonLabel(c.transferReason)}` };
    case "analyst":
      return c.analystId === me.id
        ? { tone: "primary", label: "Você está atendendo" }
        : { tone: "primary", label: `Com ${c.analyst?.name ?? "outro analista"}` };
    case "agent":
      return { tone: "success", label: "Agent atendendo" };
    case "closed":
      return { tone: "muted", label: "Encerrada" };
  }
}

const AVATARS = [
  ["#DCE9F7", "#0062C4"],
  ["#F6E3D3", "#9A4A12"],
  ["#E6E1F7", "#5B3FC4"],
  ["#DDF0E6", "#1E7A4C"],
  ["#F7E1E6", "#A3324F"],
  ["#E5E8EC", "#3D4656"],
  ["#FBEFD0", "#8A6100"],
] as const;

/** Cor estável por pessoa (hash do id). */
export function avatarColors(id: string): { background: string; color: string } {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [background, color] = AVATARS[h % AVATARS.length]!;
  return { background, color };
}

export const firstName = (name: string | undefined) => name?.trim().split(/\s+/)[0] ?? "";

const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function dayDiff(iso: string, now = new Date()): number {
  const a = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(now) - start(a)) / 86_400_000);
}

/** "10:05", "ontem" ou "16 out" (lista de conversas). */
export function listTime(iso: string): string {
  const diff = dayDiff(iso);
  if (diff <= 0) return hhmm(iso);
  if (diff === 1) return "ontem";
  return formatDay(iso);
}

/** Separador de dia no histórico. */
export function dayLabel(iso: string): string {
  const diff = dayDiff(iso);
  if (diff <= 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return formatDay(iso);
}

/** Prévia da última mensagem: "Nexo: …", "Você: …". */
export function lastPreview(c: AnalystConversation, me: SessionUser): string {
  const m = c.lastMessage;
  if (!m) return "Sem mensagens";
  const text = m.content || payloadSummary(m.payload ?? []).join(" · ") || "(resposta estruturada)";
  if (m.role === "agent") return `Nexo: ${text}`;
  if (m.role === "analyst") return `${c.analystId === me.id ? "Você" : firstName(c.analyst?.name) || "Analista"}: ${text}`;
  return text;
}

/** O que o assistente já produziu nesta conversa, condensado para o atendente (sem nova chamada ao modelo). */
export interface AssistantBrief {
  /** Motivo da transferência em texto e o resumo que o agent escreveu para o analista. */
  reason: string | null;
  summary: string | null;
  /** Última decisão declarada pelo agent (report-decision). */
  decision: { understanding: string; action: string; reasoning: string; confidence: Confidence } | null;
  /** Passos concluídos ao longo da conversa, sem repetição. */
  steps: string[];
  /** Artigos da central mostrados ao funcionário. */
  articles: string[];
}

export function assistantBrief(d: AnalystConversationDetail): AssistantBrief | null {
  const c = d.conversation;
  const agent = d.messages.filter((m) => m.role === "agent");
  const decision = [...agent].reverse().find((m) => m.trace?.decision)?.trace?.decision ?? null;
  const steps = new Set<string>();
  const articles = new Set<string>();
  for (const m of agent) {
    for (const a of m.trace?.actions ?? []) if (a.status === "done") steps.add(a.label);
    for (const p of m.payload ?? []) if (p.kind === "articles") p.data.forEach((a) => articles.add(a.title));
  }
  if (!c.transferSummary && !decision && steps.size === 0) return null;
  return {
    reason: c.transferReason ? reasonLabel(c.transferReason) : null,
    summary: c.transferSummary,
    decision,
    steps: [...steps],
    articles: [...articles],
  };
}

/** Resumo em texto dos cards estruturados (o analista vê o que o funcionário recebeu, sem botões). */
export function payloadSummary(parts: PayloadPart[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    if (p.kind === "draft") {
      const verb = p.data.mode === "create" ? "abrir chamado" : p.data.mode === "update" ? `complementar ${p.data.ticket?.id}` : `reabrir ${p.data.ticket?.id}`;
      out.push(`Rascunho para ${verb}: "${p.data.title}" · ${p.data.typeLabel} · ${p.data.category} · prioridade ${p.data.priorityLabel.toLowerCase()}`);
    } else if (p.kind === "tickets") out.push(`Chamados mostrados: ${p.data.map((t) => t.id).join(", ")}`);
    else if (p.kind === "ticket") out.push(`Chamado ${p.data.ticket.id} · ${p.data.ticket.statusLabel}`);
    else if (p.kind === "articles") out.push(`Artigos: ${p.data.map((a) => a.title).join("; ")}`);
    else if (p.kind === "options") out.push(`Opções: ${p.data.map((o) => o.label).join(" · ")}`);
  }
  return out;
}
