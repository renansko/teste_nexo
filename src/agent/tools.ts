/**
 * Tools do agent: única ponte entre o agent e o serviço de chamados.
 * @wiki docs/brain/services/SupportAgent.md
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getTicket, listTickets } from "@/services/tickets/ticketService";

export const getTicketTool = createTool({
  id: "get-ticket",
  description: "Consulta um chamado pelo id (ex: CH-1A2B3C4D).",
  inputSchema: z.object({ id: z.string() }),
  execute: async ({ id }) => getTicket(id) ?? { error: "Chamado não encontrado" },
});

export const listTicketsTool = createTool({
  id: "list-tickets",
  description: "Lista chamados de um cliente (e-mail) opcionalmente filtrando por status.",
  inputSchema: z.object({
    customer: z.string().optional(),
    status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  }),
  execute: async (input) => listTickets(input),
});
