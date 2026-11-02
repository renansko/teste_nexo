/**
 * Persona "Nexo Assist": instruções, modelos, tools, flows e limites. Tudo que é específico da Nexo mora aqui.
 * @wiki docs/brain/services/NexoAssistant.md
 */
import type { AssistantConfig } from "@/engine/types";
import { env } from "@/lib/env";
import { NEXO_INSTRUCTIONS } from "./instructions";
import { citeArticles, searchHelpCenter } from "./tools/helpCenter";
import { getMyTicket, listMyTickets } from "./tools/tickets";
import { transferToAnalyst } from "./tools/transfer";
import { addTicketUpdate, openTicket, reopenTicket } from "./tools/ticketActions";
import { openTicketFlow } from "./flows/openTicket";
import { nexoActions } from "./actions";
import { nexoHooks } from "./hooks";

export const nexoAssistant: AssistantConfig = {
  id: "nexo",
  name: "Nexo Assist",
  model: env().NEXO_MODEL,
  fastModel: env().NEXO_FAST_MODEL,
  instructions: NEXO_INSTRUCTIONS,
  tools: { searchHelpCenter, citeArticles, listMyTickets, getMyTicket, transferToAnalyst, openTicket, addTicketUpdate, reopenTicket },
  // O flow continua registrado para "Editar X" do rascunho (resumeAtStep); as perguntas iniciais são da tool open-ticket.
  flows: { [openTicketFlow.id]: openTicketFlow },
  actions: nexoActions,
  limits: {
    maxUserMessages: env().NEXO_MESSAGE_LIMIT,
    maxSteps: 6,
    historyWindow: 20,
  },
  waitingText: "Um analista está cuidando desta conversa. Sua mensagem foi registrada e ele responderá por aqui.",
  hooks: nexoHooks,
};
