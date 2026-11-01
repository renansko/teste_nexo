/**
 * Persona "Nexo Assist": instruções, modelos, tools, flows e limites. Tudo que é específico da Nexo mora aqui.
 * @wiki docs/brain/services/NexoAssistant.md
 */
import type { AssistantConfig } from "@/engine/types";
import { env } from "@/lib/env";
import { NEXO_INSTRUCTIONS } from "./instructions";
import { searchHelpCenter } from "./tools/helpCenter";
import { getMyTicket, listMyTickets } from "./tools/tickets";
import { transferToAnalyst } from "./tools/transfer";
import { addTicketUpdate, reopenTicket, startOpenTicketFlow } from "./tools/ticketActions";
import { openTicketFlow } from "./flows/openTicket";
import { nexoActions } from "./actions";

export const nexoAssistant: AssistantConfig = {
  id: "nexo",
  name: "Nexo Assist",
  model: env().NEXO_MODEL,
  fastModel: env().NEXO_FAST_MODEL,
  instructions: NEXO_INSTRUCTIONS,
  tools: { searchHelpCenter, listMyTickets, getMyTicket, transferToAnalyst, startOpenTicketFlow, addTicketUpdate, reopenTicket },
  flows: { [openTicketFlow.id]: openTicketFlow },
  actions: nexoActions,
  limits: {
    maxUserMessages: env().NEXO_MESSAGE_LIMIT,
    maxSteps: 6,
    historyWindow: 20,
  },
  waitingText: "Um analista está cuidando desta conversa. Sua mensagem foi registrada e ele responderá por aqui.",
};
