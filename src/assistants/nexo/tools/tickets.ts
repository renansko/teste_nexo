/** Tools de consulta de chamados: sempre no escopo do funcionário logado (privacidade). */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { ToolSpec } from "@/engine/types";
import { getTicketForRequester, listTickets, listUpdates, toView, type TicketView } from "@/services/tickets/ticketService";
import { withRetry } from "@/services/tickets/legacyGateway";
import type { TicketUpdate } from "@/services/tickets/types";
import { currentUserId } from "./context";
import { ANALYST_OPTION, optionsPart, ticketOption, ticketPart, ticketsPart } from "../payload";

const modelTicket = (t: TicketView) => ({
  id: t.id, type: t.type, title: t.title, status: t.statusLabel, priority: t.priorityLabel, category: t.category,
  dueAt: t.dueAt, overdue: t.overdue, updatedAt: t.updatedAt, affected: t.affected,
});

type ListInput = { status?: "open" | "resolved" | "all"; purpose?: "show" | "check" };

export const listMyTickets: ToolSpec<ListInput, TicketView[]> = {
  label: (i) => (i.purpose === "check" ? "verificou se já existe chamado parecido" : "consultou seus chamados"),
  tool: createTool({
    id: "list-my-tickets",
    description:
      "Lista os chamados do funcionário logado (abertos por padrão). purpose=show: ele quer ver/escolher um chamado (status, sem lembrar o número); a lista aparece para ele. purpose=check: só para você conferir antes de abrir chamado (duplicidade); nada aparece para ele.",
    inputSchema: z.object({
      status: z.enum(["open", "resolved", "all"]).optional().describe("open (padrão), resolved ou all"),
      purpose: z.enum(["show", "check"]).optional().describe("show (padrão): mostra a lista ao funcionário; check: só consulta interna, sem cards"),
    }),
    execute: async ({ status }, context) => {
      const requesterId = currentUserId(context);
      const open = status === "all" ? undefined : status !== "resolved";
      const { result } = await withRetry(() => listTickets({ requesterId, open }));
      return result.map((t) => toView(t));
    },
  }),
  summarize: (_i, tickets) => {
    const overdue = tickets.filter((t) => t.overdue).length;
    return `${tickets.length} chamado(s)${overdue ? `, ${overdue} vencido(s)` : ""}`;
  },
  toModel: (tickets) => tickets.map(modelTicket),
  toPayload: (i, tickets) => {
    // Checagem de duplicidade é interna: a lista inteira (e o "falar com analista" de um vencido qualquer) só confundiria.
    if (!tickets.length || i.purpose === "check") return undefined;
    const options = tickets.slice(0, 4).map(ticketOption);
    if (tickets.some((t) => t.overdue)) options.push(ANALYST_OPTION);
    return [ticketsPart(tickets), optionsPart(options)];
  },
};

export const getMyTicket: ToolSpec<{ id: string }, { ticket: TicketView; updates: TicketUpdate[] } | { error: string }> = {
  label: ({ id }) => `consultou o chamado ${String(id).toUpperCase()}`,
  tool: createTool({
    id: "get-my-ticket",
    description: "Detalha um chamado do funcionário logado pelo número (ex.: INC-20311), incluindo histórico de atualizações e se está vencido.",
    inputSchema: z.object({ id: z.string().describe("Número do chamado, ex.: INC-20311") }),
    execute: async ({ id }, context) => {
      const requesterId = currentUserId(context);
      const { result } = await withRetry(() => {
        const t = getTicketForRequester(id, requesterId);
        return t ? { ticket: toView(t), updates: listUpdates(t.id) } : undefined;
      });
      return result ?? { error: "Chamado não encontrado entre os seus chamados." };
    },
  }),
  summarize: (_i, out) => ("error" in out ? out.error : `${out.ticket.id}: ${out.ticket.statusLabel}${out.ticket.overdue ? ", vencido" : ""}`),
  toModel: (out) => ("error" in out ? out : { ticket: modelTicket(out.ticket), description: out.ticket.description, updates: out.updates.map((u) => ({ by: u.authorRole, text: u.text, at: u.createdAt })) }),
  toPayload: (_i, out) => {
    if ("error" in out) return undefined;
    const parts = [ticketPart(out.ticket, out.updates)];
    if (out.ticket.overdue) parts.push(optionsPart([ANALYST_OPTION]));
    return parts;
  },
};
