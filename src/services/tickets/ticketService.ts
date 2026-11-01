/**
 * Serviço de chamados SIMULADO. Fica deliberadamente fora de src/agent:
 * o agent só o acessa via tools (src/agent/tools.ts).
 * @wiki docs/brain/services/TicketService.md
 */
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { Ticket, TicketPriority, TicketStatus } from "./types";

interface Row {
  id: string; customer: string; subject: string; description: string;
  status: TicketStatus; priority: TicketPriority; created_at: string; updated_at: string;
}

const toTicket = (r: Row): Ticket => ({
  id: r.id, customer: r.customer, subject: r.subject, description: r.description,
  status: r.status, priority: r.priority, createdAt: r.created_at, updatedAt: r.updated_at,
});

export function createTicket(input: {
  customer: string; subject: string; description: string; priority?: TicketPriority;
}): Ticket {
  const now = new Date().toISOString();
  const id = `CH-${randomUUID().slice(0, 8).toUpperCase()}`;
  getDb()
    .prepare(`INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, input.customer, input.subject, input.description, "open", input.priority ?? "medium", now, now);
  return getTicket(id)!;
}

export function getTicket(id: string): Ticket | undefined {
  const r = getDb().prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) as Row | undefined;
  return r && toTicket(r);
}

export function listTickets(filter: { customer?: string; status?: TicketStatus } = {}): Ticket[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM tickets
       WHERE (? IS NULL OR customer = ?) AND (? IS NULL OR status = ?)
       ORDER BY created_at DESC`,
    )
    .all(filter.customer ?? null, filter.customer ?? null, filter.status ?? null, filter.status ?? null) as unknown as Row[];
  return rows.map(toTicket);
}

export function updateTicketStatus(id: string, status: TicketStatus): Ticket | undefined {
  getDb().prepare(`UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?`).run(status, new Date().toISOString(), id);
  return getTicket(id);
}

/** Popula chamados de exemplo apenas se a tabela estiver vazia. */
export function seedTickets(): void {
  const { n } = getDb().prepare(`SELECT COUNT(*) AS n FROM tickets`).get() as { n: number };
  if (n > 0) return;
  createTicket({ customer: "maria@example.com", subject: "Fatura duplicada", description: "Fui cobrada duas vezes no mês.", priority: "high" });
  createTicket({ customer: "joao@example.com", subject: "Não consigo logar", description: "Erro ao redefinir a senha.", priority: "medium" });
}
