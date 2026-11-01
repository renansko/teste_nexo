/**
 * Transições do analista sobre a conversa. O funcionário nunca muda o estado diretamente.
 *   agent | waiting_analyst --take--> analyst --return--> agent ; qualquer --close--> closed
 * @wiki docs/brain/entities/Conversation.md
 */
import { AppError } from "@/lib/errors";
import type { Employee } from "@/services/employees/employeeService";
import { addMessage, getConversation, updateConversation, type Conversation, type Message } from "@/services/conversations/conversationService";

function load(id: string): Conversation {
  const c = getConversation(id);
  if (!c) throw new AppError("NOT_FOUND", "Conversa não encontrada", 404);
  return c;
}

function system(id: string, text: string, now: Date): Message {
  return addMessage(id, { role: "system", content: text }, now);
}

/** Analista assume: o agent fica pausado até devolver ou encerrar. */
export function takeConversation(id: string, analyst: Employee, now = new Date()): { conversation: Conversation; messages: Message[] } {
  const c = load(id);
  if (c.state === "closed") throw new AppError("CONVERSATION_CLOSED", "Conversa encerrada", 409);
  if (c.state === "analyst" && c.analystId !== analyst.id) throw new AppError("ALREADY_TAKEN", "Outro analista já está atendendo", 409);
  const conversation = updateConversation(id, { state: "analyst", analystId: analyst.id, activeFlow: null, pendingAction: null }, now);
  const m = c.state === "analyst" ? [] : [system(id, `${analyst.name} assumiu a conversa. O Nexo Assist está em pausa.`, now)];
  return { conversation, messages: m };
}

export function analystReply(id: string, analyst: Employee, text: string, now = new Date()): { conversation: Conversation; message: Message } {
  const c = load(id);
  if (c.state !== "analyst" || c.analystId !== analyst.id) throw new AppError("NOT_ASSIGNED", "Assuma a conversa antes de responder", 409);
  if (!text.trim()) throw new AppError("MESSAGE_REQUIRED", "Mensagem vazia", 400);
  const message = addMessage(id, { role: "analyst", content: text.trim() }, now);
  return { conversation: getConversation(id)!, message };
}

/** Devolve ao agent, que volta a responder com o histórico (inclusive as falas do analista). */
export function returnToAgent(id: string, analyst: Employee, now = new Date()): { conversation: Conversation; messages: Message[] } {
  const c = load(id);
  if (c.state !== "analyst" || c.analystId !== analyst.id) throw new AppError("NOT_ASSIGNED", "Só quem está atendendo pode devolver", 409);
  const conversation = updateConversation(id, { state: "agent", analystId: null, transferReason: null }, now);
  return { conversation, messages: [system(id, `${analyst.name} devolveu a conversa ao Nexo Assist.`, now)] };
}

export function closeConversation(id: string, analyst: Employee, now = new Date()): { conversation: Conversation; messages: Message[] } {
  const c = load(id);
  if (c.state === "closed") return { conversation: c, messages: [] };
  const conversation = updateConversation(id, { state: "closed", activeFlow: null, pendingAction: null }, now);
  return { conversation, messages: [system(id, `${analyst.name} encerrou a conversa.`, now)] };
}
