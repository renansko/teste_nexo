/** Tools que mudam chamados: nenhuma executa direto; todas terminam num rascunho para confirmação. */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { PendingAction, StartFlowOutput, ToolSpec } from "@/engine/types";
import { AppError, notFound } from "@/lib/errors";
import { getTicketForRequester, toView } from "@/services/tickets/ticketService";
import { canReopen } from "@/services/tickets/dedup";
import { withRetry } from "@/services/tickets/legacyGateway";
import { isOpenStatus, TICKET_CATEGORIES } from "@/services/tickets/types";
import { currentUserId } from "./context";
import { OPEN_TICKET_FLOW, TYPE_LABEL, type TicketDraft } from "../flows/openTicket";

type StartInput = { title?: string; description?: string; type?: "INC" | "REQ"; category?: (typeof TICKET_CATEGORIES)[number]; forceNew?: boolean; relatedTicketId?: string };

export const startOpenTicketFlow: ToolSpec<StartInput, StartFlowOutput> = {
  label: "iniciou a abertura de chamado",
  tool: createTool({
    id: "start-open-ticket-flow",
    description: "Inicia a abertura de um chamado por perguntas guiadas. Preencha o que o funcionário JÁ disse (título, descrição, tipo, categoria) para não perguntar de novo; deixe vazio o que não tiver certeza. O flow pergunta o resto, classifica a prioridade, verifica duplicidade e mostra um rascunho para confirmação.",
    inputSchema: z.object({
      title: z.string().min(5).max(120).optional().describe("Resumo do problema em uma frase, se já souber"),
      description: z.string().min(10).max(2000).optional().describe("Descrição com o que acontece, desde quando e o que já foi tentado"),
      type: z.enum(["INC", "REQ"]).optional().describe("INC: algo parou/não funciona; REQ: pedido de acesso, equipamento ou software"),
      category: z.enum(TICKET_CATEGORIES).optional(),
      forceNew: z.boolean().optional().describe("true quando o funcionário quer um chamado novo apesar de existir um parecido"),
      relatedTicketId: z.string().optional().describe(
        "Id de um chamado do funcionário (aberto, ou resolvido há até 7 dias) que trata do MESMO problema, mesmo descrito com outras palavras (ex.: 'PC demorando depois do update' = 'Notebook lento após atualização do Windows'). Consulte list-my-tickets antes. O sistema confere se o chamado é dele; na dúvida, não preencha.",
      ),
    }),
    execute: async (input) => {
      const data: Record<string, string> = {};
      if (input.relatedTicketId) data.related_hint = input.relatedTicketId.trim().toUpperCase();
      if (input.title) data.title = input.title;
      if (input.description) data.description = input.description;
      if (input.type) data.type = input.type;
      if (input.category) data.category = input.category;
      if (input.forceNew) data.force_new = "1";
      return { startFlow: { flowId: OPEN_TICKET_FLOW, data } };
    },
  }),
  summarize: (i, out) => {
    const keys = Object.keys(out.startFlow.data).filter((k) => k !== "force_new" && k !== "related_hint");
    const base = keys.length ? `pré-preenchido: ${keys.join(", ")}` : "sem pré-preenchimento";
    return i.relatedTicketId ? `${base}; indicou ${i.relatedTicketId.toUpperCase()} como o mesmo problema` : base;
  },
};

export const addTicketUpdate: ToolSpec<{ ticketId: string; text: string }, PendingAction> = {
  label: ({ ticketId }) => `preparou complemento do chamado ${String(ticketId).toUpperCase()}`,
  requiresConfirmation: true,
  tool: createTool({
    id: "add-ticket-update",
    description: "Prepara um complemento (nova informação) para um chamado ABERTO do funcionário. Gera um rascunho que ele confirma pelos botões; nada é gravado antes disso.",
    inputSchema: z.object({ ticketId: z.string(), text: z.string().min(5).max(2000).describe("Texto do complemento, nas palavras do funcionário") }),
    execute: async ({ ticketId, text }, context) => {
      const userId = currentUserId(context);
      const { result: ticket } = await withRetry(() => getTicketForRequester(ticketId, userId));
      if (!ticket) throw notFound("Chamado");
      if (!isOpenStatus(ticket.status)) throw new AppError("TICKET_NOT_OPEN", `O chamado ${ticket.id} não está aberto (${ticket.status}).`, 409);
      const view = toView(ticket);
      const draft: Partial<TicketDraft> = { mode: "update", ticket: view, text, title: view.title, type: view.type, typeLabel: TYPE_LABEL[view.type], category: view.category, priority: view.priority, priorityLabel: view.priorityLabel, related: [] };
      return { kind: "update-ticket", label: `complementar o chamado ${ticket.id}`, input: { ticketId: ticket.id, text }, draft, createdAt: new Date().toISOString() };
    },
  }),
};

export const reopenTicket: ToolSpec<{ ticketId: string; reason: string }, PendingAction> = {
  label: ({ ticketId }) => `preparou reabertura do chamado ${String(ticketId).toUpperCase()}`,
  requiresConfirmation: true,
  tool: createTool({
    id: "reopen-ticket",
    description: "Prepara a reabertura de um chamado do funcionário resolvido há até 7 dias. Gera um rascunho para confirmação.",
    inputSchema: z.object({ ticketId: z.string(), reason: z.string().min(5).max(1000).describe("Por que o problema voltou") }),
    execute: async ({ ticketId, reason }, context) => {
      const userId = currentUserId(context);
      const now = new Date();
      const { result: ticket } = await withRetry(() => getTicketForRequester(ticketId, userId));
      if (!ticket) throw notFound("Chamado");
      if (!canReopen(ticket, now)) throw new AppError("REOPEN_NOT_ALLOWED", `O chamado ${ticket.id} não pode ser reaberto: só chamados resolvidos há até 7 dias.`, 409);
      const view = toView(ticket, now);
      const draft: Partial<TicketDraft> = { mode: "reopen", ticket: view, text: reason, title: view.title, type: view.type, typeLabel: TYPE_LABEL[view.type], category: view.category, priority: view.priority, priorityLabel: view.priorityLabel, related: [] };
      return { kind: "reopen-ticket", label: `reabrir o chamado ${ticket.id}`, input: { ticketId: ticket.id, text: reason }, draft, createdAt: now.toISOString() };
    },
  }),
};
