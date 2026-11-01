/**
 * Serviço de chamados SIMULADO (sistema legado). Não conhece agent, conversa nem LLM.
 * Toda operação pública passa pelo gateway que simula indisponibilidade.
 * @wiki docs/brain/services/TicketService.md
 */
import { getDb, transaction } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { computeDueAt, isPastDue, SLA_LABEL } from "./sla";
import { canReopen, findRelated, type RelatedTicket } from "./dedup";
import { legacyGateway } from "./legacyGateway";
import {
  isOpenStatus, PRIORITY_LABEL, STATUS_LABEL,
  type Ticket, type TicketCategory, type TicketPriority, type TicketStatus, type TicketType, type TicketUpdate,
} from "./types";

interface Row {
  id: string; type: TicketType; title: string; description: string; category: TicketCategory;
  priority: TicketPriority; status: TicketStatus; requester_id: string; affected: string;
  created_at: string; updated_at: string; due_at: string; resolved_at: string | null;
}

const toTicket = (r: Row): Ticket => ({
  id: r.id, type: r.type, title: r.title, description: r.description, category: r.category,
  priority: r.priority, status: r.status, requesterId: r.requester_id, affected: r.affected,
  createdAt: r.created_at, updatedAt: r.updated_at, dueAt: r.due_at, resolvedAt: r.resolved_at,
});

/** Visão enriquecida para UI/agent: rótulos e flag de vencido. */
export interface TicketView extends Ticket {
  overdue: boolean;
  priorityLabel: string;
  statusLabel: string;
  slaLabel: string;
}

export const toView = (t: Ticket, now = new Date()): TicketView => ({
  ...t,
  overdue: isOpenStatus(t.status) && isPastDue(t.dueAt, now),
  priorityLabel: PRIORITY_LABEL[t.priority],
  statusLabel: STATUS_LABEL[t.status],
  slaLabel: SLA_LABEL[t.priority],
});

export interface NewTicket {
  type: TicketType; title: string; description: string; category: TicketCategory;
  priority: TicketPriority; requesterId: string; affected: string;
}

const PREFIX_START: Record<TicketType, number> = { INC: 20400, REQ: 10500 };

function nextId(type: TicketType): string {
  const db = getDb();
  const row = db.prepare(`SELECT next FROM ticket_sequences WHERE prefix = ?`).get(type) as { next: number } | undefined;
  const n = row?.next ?? PREFIX_START[type];
  db.prepare(`INSERT INTO ticket_sequences (prefix, next) VALUES (?, ?) ON CONFLICT(prefix) DO UPDATE SET next = excluded.next`).run(type, n + 1);
  return `${type}-${n}`;
}

function getRaw(id: string): Ticket | undefined {
  const r = getDb().prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) as Row | undefined;
  return r && toTicket(r);
}

/** Inserção direta (seed/testes): não passa pelo gateway e aceita id e datas explícitos. */
export function insertTicketRaw(t: Ticket, idempotencyKey: string | null = null): Ticket {
  getDb().prepare(
    `INSERT INTO tickets (id, type, title, description, category, priority, status, requester_id, affected, created_at, updated_at, due_at, resolved_at, idempotency_key)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    t.id, t.type, t.title, t.description, t.category, t.priority, t.status, t.requesterId, t.affected,
    t.createdAt, t.updatedAt, t.dueAt, t.resolvedAt, idempotencyKey,
  );
  const n = Number(t.id.split("-")[1]);
  const db = getDb();
  const seq = db.prepare(`SELECT next FROM ticket_sequences WHERE prefix = ?`).get(t.type) as { next: number } | undefined;
  if (!seq || seq.next <= n) {
    db.prepare(`INSERT INTO ticket_sequences (prefix, next) VALUES (?, ?) ON CONFLICT(prefix) DO UPDATE SET next = excluded.next`).run(t.type, Math.max(n + 1, PREFIX_START[t.type]));
  }
  return t;
}

export function insertUpdateRaw(u: Omit<TicketUpdate, "id">, idempotencyKey: string | null = null): void {
  getDb().prepare(`INSERT INTO ticket_updates (ticket_id, author_id, author_role, text, created_at, idempotency_key) VALUES (?,?,?,?,?,?)`)
    .run(u.ticketId, u.authorId, u.authorRole, u.text, u.createdAt, idempotencyKey);
}

/** Opções de escrita: `idempotencyKey` torna a operação repetível sem efeito duplo. */
export interface WriteOptions {
  idempotencyKey?: string;
}

const byKey = (key: string | undefined): Ticket | undefined => {
  if (!key) return undefined;
  const r = getDb().prepare(`SELECT * FROM tickets WHERE idempotency_key = ?`).get(key) as Row | undefined;
  return r && toTicket(r);
};

/** A atualização com esta chave já foi gravada? Devolve o chamado dela. */
const updateByKey = (key: string | undefined): Ticket | undefined => {
  if (!key) return undefined;
  const r = getDb().prepare(`SELECT ticket_id FROM ticket_updates WHERE idempotency_key = ?`).get(key) as { ticket_id: string } | undefined;
  return r ? getRaw(r.ticket_id) : undefined;
};

/** Chamado aberto parecido já existe: o serviço recusa criar outro (Anexo A, sem duplicidade). */
export const duplicateTicketError = (t: Ticket) =>
  new AppError("DUPLICATE_TICKET", `Já existe o chamado ${t.id} aberto sobre o mesmo problema`, 409, { ticketId: t.id });

export function countTickets(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM tickets`).get() as { n: number }).n;
}

// ---- Pré-condições de escrita (mesmas regras na tool, que monta o rascunho, e no commit) ----

/** Só chamados abertos aceitam complemento. */
export function assertCanUpdate(t: Ticket): void {
  if (!isOpenStatus(t.status)) throw new AppError("TICKET_NOT_OPEN", `O chamado ${t.id} não está aberto (${STATUS_LABEL[t.status]}).`, 409);
}

/** Só chamados resolvidos há até 7 dias podem ser reabertos. */
export function assertCanReopen(t: Ticket, now = new Date()): void {
  if (!canReopen(t, now)) throw new AppError("REOPEN_NOT_ALLOWED", `O chamado ${t.id} não pode ser reaberto: só chamados resolvidos há até 7 dias.`, 409);
}

// ---- API pública (passa pelo gateway legado) ----

/**
 * Cria o chamado. Na mesma transação:
 * 1. mesma `idempotencyKey` já gravada → devolve o chamado existente (repetição segura: duplo clique, fila);
 * 2. sem `allowSimilar`, chamado ABERTO parecido do mesmo solicitante → `DUPLICATE_TICKET` (rascunhos paralelos).
 */
export function createTicket(input: NewTicket, now = new Date(), opts: WriteOptions & { allowSimilar?: boolean } = {}): Ticket {
  return legacyGateway.call(() =>
    transaction(() => {
      const replay = byKey(opts.idempotencyKey);
      if (replay) return replay;
      if (!opts.allowSimilar) {
        const open = (getDb().prepare(`SELECT * FROM tickets WHERE requester_id = ?`).all(input.requesterId) as unknown as Row[]).map(toTicket);
        const dup = findRelated(input, open, now).find((r) => r.kind === "duplicate");
        if (dup) throw duplicateTicketError(dup.ticket);
      }
      const id = nextId(input.type);
      const iso = now.toISOString();
      const t: Ticket = {
        id, type: input.type, title: input.title, description: input.description, category: input.category,
        priority: input.priority, requesterId: input.requesterId, affected: input.affected,
        status: "aberto", createdAt: iso, updatedAt: iso,
        dueAt: computeDueAt(input.priority, now).toISOString(), resolvedAt: null,
      };
      insertTicketRaw(t, opts.idempotencyKey ?? null);
      return t;
    }),
  );
}

export function getTicket(id: string): Ticket | undefined {
  return legacyGateway.call(() => getRaw(id));
}

/** Privacidade: só devolve o chamado se pertence ao solicitante. Caso contrário, "não existe". */
export function getTicketForRequester(id: string, requesterId: string): Ticket | undefined {
  const t = getTicket(id.trim().toUpperCase());
  return t && t.requesterId === requesterId ? t : undefined;
}

export function listTickets(filter: { requesterId?: string; status?: TicketStatus; open?: boolean } = {}): Ticket[] {
  return legacyGateway.call(() => {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (filter.requesterId) { where.push(`requester_id = ?`); args.push(filter.requesterId); }
    if (filter.status) { where.push(`status = ?`); args.push(filter.status); }
    if (filter.open === true) where.push(`status IN ('aberto','em_atendimento','aguardando_analista','aprovado')`);
    if (filter.open === false) where.push(`status IN ('resolvido','fechado')`);
    const sql = `SELECT * FROM tickets ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC`;
    return (getDb().prepare(sql).all(...args) as unknown as Row[]).map(toTicket);
  });
}

export function listUpdates(ticketId: string): TicketUpdate[] {
  return legacyGateway.call(() =>
    (getDb().prepare(`SELECT * FROM ticket_updates WHERE ticket_id = ? ORDER BY id`).all(ticketId) as unknown as
      { id: number; ticket_id: string; author_id: string; author_role: TicketUpdate["authorRole"]; text: string; created_at: string }[])
      .map((r) => ({ id: r.id, ticketId: r.ticket_id, authorId: r.author_id, authorRole: r.author_role, text: r.text, createdAt: r.created_at })),
  );
}

/** Complementa o chamado. Renova o prazo (Anexo A: o prazo vale para cada atualização). */
export function addTicketUpdate(
  id: string,
  update: { authorId: string; authorRole: TicketUpdate["authorRole"]; text: string },
  now = new Date(),
  opts: WriteOptions = {},
): Ticket {
  return legacyGateway.call(() =>
    transaction(() => {
      const replay = updateByKey(opts.idempotencyKey);
      if (replay) return replay;
      const t = getRaw(id);
      if (!t) throw notFound("Chamado");
      assertCanUpdate(t);
      const iso = now.toISOString();
      insertUpdateRaw({ ticketId: id, ...update, createdAt: iso }, opts.idempotencyKey ?? null);
      getDb().prepare(`UPDATE tickets SET updated_at = ?, due_at = ? WHERE id = ?`)
        .run(iso, computeDueAt(t.priority, now).toISOString(), id);
      return getRaw(id)!;
    }),
  );
}

export function updateTicketStatus(id: string, status: TicketStatus, now = new Date()): Ticket {
  return legacyGateway.call(() => {
    const t = getRaw(id);
    if (!t) throw notFound("Chamado");
    const iso = now.toISOString();
    const resolvedAt = status === "resolvido" ? iso : status === "fechado" ? t.resolvedAt : null;
    getDb().prepare(`UPDATE tickets SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?`).run(status, iso, resolvedAt, id);
    return getRaw(id)!;
  });
}

/** Reabre chamado resolvido há até 7 dias; volta a `aberto` com novo prazo. */
export function reopenTicket(id: string, reason: { authorId: string; text: string }, now = new Date(), opts: WriteOptions = {}): Ticket {
  return legacyGateway.call(() =>
    transaction(() => {
      const replay = updateByKey(opts.idempotencyKey);
      if (replay) return replay;
      const t = getRaw(id);
      if (!t) throw notFound("Chamado");
      assertCanReopen(t, now);
      const iso = now.toISOString();
      insertUpdateRaw({ ticketId: id, authorId: reason.authorId, authorRole: "employee", text: `Reaberto: ${reason.text}`, createdAt: iso }, opts.idempotencyKey ?? null);
      getDb().prepare(`UPDATE tickets SET status = 'aberto', updated_at = ?, due_at = ?, resolved_at = NULL WHERE id = ?`)
        .run(iso, computeDueAt(t.priority, now).toISOString(), id);
      return getRaw(id)!;
    }),
  );
}

/** Candidatos a duplicado/reabertura entre os chamados do próprio solicitante. */
export function findRelatedTickets(
  requesterId: string,
  candidate: { title: string; description?: string; category?: string },
  now = new Date(),
): RelatedTicket[] {
  return findRelated(candidate, listTickets({ requesterId }), now);
}
