/**
 * Orquestra um turno de conversa respeitando o estado (agent ↔ analista).
 * @wiki docs/brain/functions/HandleMessage.md
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createSupportAgent } from "./supportAgent";
import { createTicket, seedTickets } from "@/services/tickets/ticketService";
import {
  addMessage, createConversation, getConversation, linkTicket, listMessages, setState,
  type Conversation,
} from "@/services/conversations";

export async function handleUserMessage(input: { conversationId?: string; message: string }): Promise<{
  conversation: Conversation; reply: string | null;
}> {
  seedTickets();
  const conv = (input.conversationId && getConversation(input.conversationId)) || createConversation();
  if (conv.state === "closed") throw new Error("CONVERSATION_CLOSED");

  addMessage(conv.id, "user", input.message);

  // Com analista envolvido, o agent NÃO responde: a mensagem fica na fila do analista.
  if (conv.state !== "agent") return { conversation: getConversation(conv.id)!, reply: null };

  const escalate = createTool({
    id: "escalate-to-analyst",
    description: "Encaminha a conversa a um analista humano e abre um chamado com o resumo do problema.",
    inputSchema: z.object({ customer: z.string(), subject: z.string(), summary: z.string() }),
    execute: async ({ customer, subject, summary }) => {
      const ticket = createTicket({ customer, subject, description: summary });
      linkTicket(conv.id, ticket.id);
      setState(conv.id, "waiting_analyst");
      return { ticketId: ticket.id };
    },
  });

  const history = listMessages(conv.id).map((m) =>
    m.role === "user"
      ? { role: "user" as const, content: m.content }
      : { role: "assistant" as const, content: m.content },
  );
  const result = await createSupportAgent({ escalateTool: escalate }).generate(history);
  addMessage(conv.id, "agent", result.text);
  return { conversation: getConversation(conv.id)!, reply: result.text };
}

/** Analista assume/responde/encerra. */
export function handleAnalystAction(id: string, action: "reply" | "close", message?: string): Conversation {
  const conv = getConversation(id);
  if (!conv) throw new Error("NOT_FOUND");
  if (action === "close") setState(id, "closed");
  else {
    if (!message) throw new Error("MESSAGE_REQUIRED");
    addMessage(id, "analyst", message);
    setState(id, "analyst");
  }
  return getConversation(id)!;
}
