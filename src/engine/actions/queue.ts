/**
 * Fila de ações confirmadas que não puderam rodar porque o sistema externo estava indisponível (erro 503).
 * O funcionário já confirmou: a ação é registrada assim que o sistema voltar, e o resultado vira mensagem na conversa.
 * A chave da fila é o id do rascunho, a mesma chave de idempotência passada ao executor: reprocessar nunca grava duas vezes.
 * @wiki docs/brain/services/ActionQueue.md
 */
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { addMessage, getConversation, updateConversation } from "@/services/conversations/conversationService";
import { getAssistant } from "../registry";
import type { ActionResult, Payload, PendingAction, Trace } from "../types";
import { PAYLOAD_OPTIONS } from "../types";
import { ANALYST_OPTION, applyAfterEffects } from "../conversation/effects";
import { pendingParts, withActionId } from "./pending";

export const MAX_QUEUE_ATTEMPTS = 30;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 5 * 60_000;

/** Espera antes da próxima tentativa: 5 s, 10 s, 20 s… até 5 min. */
export const queueBackoffMs = (attempts: number) => Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);

/** Erro de indisponibilidade temporária (o sistema pode voltar): vale enfileirar. */
export const isTemporarilyUnavailable = (e: unknown) => e instanceof AppError && e.status === 503;

export type QueueStatus = "queued" | "processing" | "done" | "failed";
export interface QueuedAction {
  id: string;
  conversationId: string;
  userId: string;
  kind: string;
  label: string;
  input: Record<string, unknown>;
  status: QueueStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
}

interface Row {
  id: string; conversation_id: string; user_id: string; kind: string; label: string; input: string; status: QueueStatus;
  attempts: number; next_attempt_at: string; last_error: string | null;
}
const toItem = (r: Row): QueuedAction => ({
  id: r.id, conversationId: r.conversation_id, userId: r.user_id, kind: r.kind, label: r.label, input: JSON.parse(r.input) as Record<string, unknown>,
  status: r.status, attempts: r.attempts, nextAttemptAt: r.next_attempt_at, lastError: r.last_error,
});

/** Enfileira (idempotente: a mesma ação nunca entra duas vezes). A primeira tentativa já conta, por isso attempts = 1. */
export function enqueueAction(p: { conversationId: string; userId: string; pending: PendingAction; error: string; now: Date }): QueuedAction {
  const pending = withActionId(p.pending);
  const iso = p.now.toISOString();
  getDb().prepare(
    `INSERT OR IGNORE INTO action_queue (id, conversation_id, user_id, kind, label, input, status, attempts, next_attempt_at, last_error, created_at, updated_at)
     VALUES (?,?,?,?,?,?,'queued',1,?,?,?,?)`,
  ).run(pending.id, p.conversationId, p.userId, pending.kind, pending.label, JSON.stringify(pending.input),
    new Date(p.now.getTime() + queueBackoffMs(1)).toISOString(), p.error, iso, iso);
  return getQueuedAction(pending.id)!;
}

export function getQueuedAction(id: string): QueuedAction | undefined {
  const r = getDb().prepare(`SELECT * FROM action_queue WHERE id = ?`).get(id) as Row | undefined;
  return r && toItem(r);
}

export function listQueuedActions(filter: { conversationId?: string; status?: QueueStatus } = {}): QueuedAction[] {
  const where: string[] = [];
  const args: string[] = [];
  if (filter.conversationId) { where.push("conversation_id = ?"); args.push(filter.conversationId); }
  if (filter.status) { where.push("status = ?"); args.push(filter.status); }
  const sql = `SELECT * FROM action_queue ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at`;
  return (getDb().prepare(sql).all(...args) as unknown as Row[]).map(toItem);
}

/** Reivindica o item (outro processo/worker não pega o mesmo). */
function claim(id: string, now: Date): boolean {
  const r = getDb().prepare(`UPDATE action_queue SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'queued'`)
    .run(now.toISOString(), id);
  return Number(r.changes) === 1;
}

function setStatus(id: string, status: QueueStatus, now: Date, extra: { nextAttemptAt?: Date; error?: string } = {}): void {
  getDb().prepare(`UPDATE action_queue SET status = ?, updated_at = ?, next_attempt_at = COALESCE(?, next_attempt_at), last_error = COALESCE(?, last_error) WHERE id = ?`)
    .run(status, now.toISOString(), extra.nextAttemptAt?.toISOString() ?? null, extra.error ?? null, id);
}

export interface QueueRunResult { done: number; retried: number; failed: number }

/** Processa os itens vencidos. Seguro para chamar em paralelo (claim atômico) e repetidamente (idempotência). */
export async function processActionQueue(opts: { now?: () => Date; limit?: number } = {}): Promise<QueueRunResult> {
  const clock = opts.now ?? (() => new Date());
  const out: QueueRunResult = { done: 0, retried: 0, failed: 0 };
  const due = getDb().prepare(`SELECT * FROM action_queue WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT ?`)
    .all(clock().toISOString(), opts.limit ?? 20) as unknown as Row[];

  for (const row of due) {
    const now = clock();
    if (!claim(row.id, now)) continue;
    const item = getQueuedAction(row.id)!;
    const conv = getConversation(item.conversationId);
    const executor = conv && getAssistant(conv.assistantId).actions[item.kind];
    if (!conv || !executor) {
      setStatus(item.id, "failed", now, { error: conv ? `executor '${item.kind}' não registrado` : "conversa não existe" });
      out.failed += 1;
      continue;
    }
    const started = Date.now();
    try {
      const result = await executor(item.input, { userId: item.userId, conversationId: item.conversationId, now, idempotencyKey: item.id });
      deliver(item, result, now, started);
      setStatus(item.id, "done", now);
      out.done += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (isTemporarilyUnavailable(e) && item.attempts < MAX_QUEUE_ATTEMPTS) {
        setStatus(item.id, "queued", now, { nextAttemptAt: new Date(now.getTime() + queueBackoffMs(item.attempts)), error: message });
        out.retried += 1;
      } else {
        setStatus(item.id, "failed", now, { error: message });
        notifyFailure(item, e, now);
        out.failed += 1;
      }
    }
  }
  return out;
}

const queueNote = (item: QueuedAction) => `executado pela fila: ${item.label}, ${item.attempts} tentativa(s)`;

function deliver(item: QueuedAction, result: ActionResult, now: Date, started: number): void {
  const conv = getConversation(item.conversationId)!;
  let payload: Payload = [...(result.payload ?? [])];
  const notes = [...(result.trace?.notes ?? []), queueNote(item)];
  // Um novo rascunho só entra se a conversa ainda está com o agent e livre; senão fica só a mensagem.
  if (result.pendingAction) {
    if (conv.state === "agent" && !conv.pendingAction && !conv.activeFlow) {
      const next = withActionId({ ...result.pendingAction, createdAt: now.toISOString() });
      updateConversation(conv.id, { pendingAction: next }, now);
      payload = [...payload, ...pendingParts(next)];
    } else {
      notes.push("novo rascunho não aplicado: conversa ocupada (analista, flow ou outro rascunho)");
    }
  }
  const trace: Trace = { source: "action", actions: result.trace?.actions ?? [], decision: result.trace?.decision, durationMs: Date.now() - started, notes };
  addMessage(conv.id, { role: "agent", content: `O sistema de chamados voltou. ${result.text}`, payload, trace }, now);
  applyAfterEffects(conv.id, result.afterEffects ?? [], now);
}

function notifyFailure(item: QueuedAction, e: unknown, now: Date): void {
  const conv = getConversation(item.conversationId);
  if (!conv) return;
  const reason = isTemporarilyUnavailable(e) ? "o sistema de chamados continua fora do ar" : e instanceof Error ? e.message : "erro inesperado";
  const payload: Payload = conv.state === "agent" ? [{ kind: PAYLOAD_OPTIONS, data: [ANALYST_OPTION] }] : [];
  addMessage(conv.id, {
    role: "agent",
    content: `Não consegui ${item.label}: ${reason}. Nada foi gravado. Se for urgente, posso chamar um analista.`,
    payload,
    trace: { source: "action", actions: [{ id: "queue", tool: item.kind, label: item.label, status: "error", summary: "desistiu após tentativas na fila" }], durationMs: 0, notes: [`${queueNote(item)}; falhou: ${reason}`] },
  }, now);
}

// ---- Worker em processo ----

let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

/** Inicia o worker (idempotente). Itens presos em 'processing' (processo caiu no meio) voltam para a fila: a idempotência torna isso seguro. */
export function startActionQueueWorker(intervalMs = 5_000): void {
  if (timer) return;
  getDb().prepare(`UPDATE action_queue SET status = 'queued' WHERE status = 'processing'`).run();
  timer = setInterval(() => {
    if (running) return;
    running = true;
    processActionQueue()
      .catch((e) => console.error("[queue]", e))
      .finally(() => { running = false; });
  }, intervalMs);
  timer.unref?.();
}

export function stopActionQueueWorker(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
