/**
 * Feedback das sugestões da central de ajuda: cada vez que o agent sugere um artigo (ou uma solução de caso
 * resolvido) e pergunta "isso resolveu?", nasce uma linha; a resposta do funcionário fecha a linha.
 * É a métrica de acerto da IA e da FAQ, e a trilha "artigo tentado → chamado aberto" usada pela memória de resolução.
 * @wiki docs/brain/entities/HelpFeedback.md
 */
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

export type KnowledgeSource = "article" | "resolution";
export type FeedbackOutcome = "pending" | "resolved" | "not_resolved" | "analyst" | "unclear";

export interface HelpFeedback {
  id: string;
  conversationId: string;
  employeeId: string;
  source: KnowledgeSource;
  sourceId: string;
  problem: string;
  outcome: FeedbackOutcome;
  employeeText: string | null;
  ticketId: string | null;
  suggestedAt: string;
  answeredAt: string | null;
}

interface Row {
  id: string; conversation_id: string; employee_id: string; source: KnowledgeSource; source_id: string; problem: string;
  outcome: FeedbackOutcome; employee_text: string | null; ticket_id: string | null; suggested_at: string; answered_at: string | null;
}

const toFeedback = (r: Row): HelpFeedback => ({
  id: r.id, conversationId: r.conversation_id, employeeId: r.employee_id, source: r.source, sourceId: r.source_id, problem: r.problem,
  outcome: r.outcome, employeeText: r.employee_text, ticketId: r.ticket_id, suggestedAt: r.suggested_at, answeredAt: r.answered_at,
});

/** Registra a sugestão feita ao funcionário (resultado ainda `pending`). Devolve o id. */
export function openFeedback(
  input: { conversationId: string; employeeId: string; source: KnowledgeSource; sourceId: string; problem: string },
  now = new Date(),
): string {
  const id = randomUUID();
  getDb().prepare(
    `INSERT INTO help_feedback (id, conversation_id, employee_id, source, source_id, problem, outcome, suggested_at) VALUES (?,?,?,?,?,?,'pending',?)`,
  ).run(id, input.conversationId, input.employeeId, input.source, input.sourceId, input.problem, now.toISOString());
  return id;
}

/** Fecha a sugestão com a resposta do funcionário. Idempotente: a última resposta vale. */
export function answerFeedback(id: string, outcome: Exclude<FeedbackOutcome, "pending">, employeeText: string | undefined, now = new Date()): HelpFeedback | undefined {
  getDb().prepare(`UPDATE help_feedback SET outcome = ?, employee_text = ?, answered_at = ? WHERE id = ?`).run(outcome, employeeText ?? null, now.toISOString(), id);
  return getFeedback(id);
}

export function getFeedback(id: string): HelpFeedback | undefined {
  const r = getDb().prepare(`SELECT * FROM help_feedback WHERE id = ?`).get(id) as Row | undefined;
  return r && toFeedback(r);
}

export function listFeedbackForConversation(conversationId: string): HelpFeedback[] {
  return (getDb().prepare(`SELECT * FROM help_feedback WHERE conversation_id = ? ORDER BY suggested_at, id`).all(conversationId) as unknown as Row[]).map(toFeedback);
}

/**
 * A conversa vinculou um chamado (criado, complementado ou reaberto): as sugestões dela que ainda não têm chamado
 * passam a apontar para ele. Chamado pelo efeito `link-ticket`, inclusive quando a fila executa minutos depois.
 */
export function linkTicket(conversationId: string, ticketId: string): number {
  const r = getDb().prepare(`UPDATE help_feedback SET ticket_id = ? WHERE conversation_id = ? AND ticket_id IS NULL`).run(ticketId, conversationId);
  return Number(r.changes);
}

/** Artigos/soluções sugeridos (e não resolvidos) nas conversas que levaram a este chamado, sem repetição. */
export function triedSourcesForTicket(ticketId: string): { source: KnowledgeSource; id: string }[] {
  const rows = getDb().prepare(
    `SELECT DISTINCT source, source_id FROM help_feedback WHERE ticket_id = ? AND outcome <> 'resolved' ORDER BY source, source_id`,
  ).all(ticketId) as unknown as { source: KnowledgeSource; source_id: string }[];
  return rows.map((r) => ({ source: r.source, id: r.source_id }));
}

export interface FeedbackMetric {
  source: KnowledgeSource;
  sourceId: string;
  shown: number;
  resolved: number;
  notResolved: number;
  analyst: number;
  unclear: number;
  pending: number;
  /** resolved / (resolved + notResolved); null sem resposta clara. */
  resolutionRate: number | null;
}

/** Acertos e erros por artigo/solução, do mais sugerido ao menos. */
export function feedbackMetrics(): FeedbackMetric[] {
  const rows = getDb().prepare(
    `SELECT source, source_id,
            COUNT(*) AS shown,
            SUM(outcome = 'resolved') AS resolved,
            SUM(outcome = 'not_resolved') AS not_resolved,
            SUM(outcome = 'analyst') AS analyst,
            SUM(outcome = 'unclear') AS unclear,
            SUM(outcome = 'pending') AS pending
     FROM help_feedback GROUP BY source, source_id ORDER BY shown DESC, source, source_id`,
  ).all() as unknown as { source: KnowledgeSource; source_id: string; shown: number; resolved: number; not_resolved: number; analyst: number; unclear: number; pending: number }[];
  return rows.map((r) => {
    const answered = r.resolved + r.not_resolved;
    return {
      source: r.source, sourceId: r.source_id, shown: r.shown, resolved: r.resolved, notResolved: r.not_resolved,
      analyst: r.analyst, unclear: r.unclear, pending: r.pending, resolutionRate: answered ? r.resolved / answered : null,
    };
  });
}
