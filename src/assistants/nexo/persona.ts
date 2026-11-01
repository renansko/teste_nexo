/**
 * Persona "Nexo Assist": instruções, modelos, tools, flows e limites. Tudo que é específico da Nexo mora aqui.
 * @wiki docs/brain/services/NexoAssistant.md
 */
import type { AssistantConfig } from "@/engine/types";
import { NEXO_INSTRUCTIONS } from "./instructions";
import { citeArticles, searchHelpCenter } from "./tools/helpCenter";
import { getMyTicket, listMyTickets } from "./tools/tickets";
import { transferToAnalyst } from "./tools/transfer";
import { addTicketUpdate, reopenTicket, startOpenTicketFlow } from "./tools/ticketActions";
import { openTicketFlow } from "./flows/openTicket";
import { nexoActions } from "./actions";

export const nexoAssistant: AssistantConfig = {
  id: "nexo",
  name: "Nexo Assist",
  model: process.env.NEXO_MODEL ?? "claude-sonnet-5-5",
  fastModel: process.env.NEXO_FAST_MODEL ?? "claude-haiku-5-5",
  instructions: NEXO_INSTRUCTIONS,
  tools: { searchHelpCenter, citeArticles, listMyTickets, getMyTicket, transferToAnalyst, startOpenTicketFlow, addTicketUpdate, reopenTicket },
  flows: { [openTicketFlow.id]: openTicketFlow },
  actions: nexoActions,
  limits: {
    maxUserMessages: Number(process.env.NEXO_MESSAGE_LIMIT ?? "30"),
    maxSteps: 6,
    historyWindow: 20,
  },
  waitingText: "Um analista está cuidando desta conversa. Sua mensagem foi registrada e ele responderá por aqui.",
};
