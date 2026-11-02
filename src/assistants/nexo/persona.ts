/**
 * Persona "Nexo Assist": instruções, modelos, tools, flows e limites. Tudo que é específico da Nexo mora aqui.
 * @wiki docs/brain/services/NexoAssistant.md
 */
import type { AssistantConfig } from "@/engine/types";
import { env } from "@/lib/env";
import { NEXO_INSTRUCTIONS } from "./instructions";
import { citeArticles, searchHelpCenter, suggestHelpArticle } from "./tools/helpCenter";
import { getMyTicket, listMyTickets } from "./tools/tickets";
import { transferToAnalyst } from "./tools/transfer";
import { addTicketUpdate, openTicket, reopenTicket } from "./tools/ticketActions";
import { openTicketFlow } from "./flows/openTicket";
import { nexoActions } from "./actions";
import { nexoHooks } from "./hooks";
import { ANALYST_OPTION, OPEN_TICKET_OPTION } from "./payload";

export const nexoAssistant: AssistantConfig = {
  id: "nexo",
  name: "Nexo Assist",
  model: env().NEXO_MODEL,
  fastModel: env().NEXO_FAST_MODEL,
  instructions: NEXO_INSTRUCTIONS,
  tools: { searchHelpCenter, citeArticles, suggestHelpArticle, listMyTickets, getMyTicket, transferToAnalyst, openTicket, addTicketUpdate, reopenTicket },
  // O flow continua registrado para "Editar X" do rascunho (resumeAtStep); as perguntas iniciais são da tool open-ticket.
  flows: { [openTicketFlow.id]: openTicketFlow },
  actions: nexoActions,
  limits: {
    maxUserMessages: env().NEXO_MESSAGE_LIMIT,
    // busca → sugestão (pausa) → retomada → open-ticket → report-decision cabem com folga.
    maxSteps: 8,
    historyWindow: 20,
  },
  // Texto livre sem conteúdo útil ("A", "???", "aaaa", "123") não chega ao modelo: o engine responde por regra com estes atalhos.
  // Mínimos e caracteres permitidos ficam nos defaults do engine (`DEFAULT_INPUT_POLICY`); mude aqui por persona.
  inputPolicy: {
    hint: 'Por exemplo: "minha VPN dá erro 809" ou "quero ver meus chamados".',
    options: [OPEN_TICKET_OPTION, ANALYST_OPTION],
  },
  waitingText: "Um analista está cuidando desta conversa. Sua mensagem foi registrada e ele responderá por aqui.",
  hooks: nexoHooks,
};
