/**
 * Executores de ações pendentes: só rodam depois que o funcionário confirmou o rascunho.
 * @wiki docs/brain/services/PendingAction.md
 */
import type { ActionContext, ActionResult, AfterEffect } from "@/engine/types";
import { addTicketUpdate, createTicket, getTicketForRequester, listUpdates, reopenTicket, toView } from "@/services/tickets/ticketService";
import { withRetry } from "@/services/tickets/legacyGateway";
import { AppError, notFound } from "@/lib/errors";
import type { TicketCategory, TicketPriority, TicketType } from "@/services/tickets/types";
import { ticketPart, ticketsPart } from "./payload";
import { formatDateTime, TYPE_LABEL, type TicketDraft } from "./flows/openTicket";

type Executor = (input: Record<string, unknown>, ctx: ActionContext) => Promise<ActionResult>;

const retryNote = (attempts: number) => (attempts > 1 ? [`sistema de chamados instável: ${attempts} tentativas`] : []);

/**
 * O serviço achou um chamado aberto parecido no momento de criar (outra conversa criou antes, ou a checagem do
 * rascunho não rodou porque o sistema estava fora). Não cria: propõe complementar o existente, com nova confirmação.
 */
function duplicateProposal(ticketId: string, input: Record<string, unknown>, ctx: ActionContext): ActionResult {
  const existing = getTicketForRequester(ticketId, ctx.userId)!;
  const view = toView(existing, ctx.now);
  const text = String(input.description);
  const draft: Partial<TicketDraft> = {
    mode: "update", ticket: view, text, title: view.title, type: view.type, typeLabel: TYPE_LABEL[view.type],
    category: view.category, priority: view.priority, priorityLabel: view.priorityLabel, related: [view],
  };
  return {
    text: `Antes de criar, encontrei o chamado ${view.id} (${view.title}) aberto sobre o mesmo problema, então não criei outro. Proponho complementá-lo com o que você contou. Confere?`,
    payload: [ticketsPart([view])],
    pendingAction: {
      kind: "update-ticket", label: `complementar o chamado ${view.id}`, input: { ticketId: view.id, text }, draft,
      extraOptions: [{ id: "criar-um-novo-mesmo-assim", label: "Criar um novo mesmo assim" }], createdAt: ctx.now.toISOString(),
    },
    trace: {
      actions: [{ id: "dedup-create", tool: "dedup-rule", label: "verificou duplicidade ao criar", status: "done", summary: `${view.id} aberto e parecido: não criou` }],
      decision: { understanding: "criar chamado sobre um problema que já tem chamado aberto", action: `não criou; propôs complementar o ${view.id}`, confidence: "alta", reasoning: "Anexo A: sem duplicidade. A checagem é refeita no momento de gravar." },
    },
  };
}

export const createTicketAction: Executor = async (input, ctx) => {
  let created;
  try {
    created = await withRetry(() =>
      createTicket({
        type: input.type as TicketType, title: String(input.title), description: String(input.description),
        category: input.category as TicketCategory, priority: input.priority as TicketPriority,
        requesterId: ctx.userId, affected: String(input.affected ?? "Só eu"),
      }, ctx.now, { idempotencyKey: ctx.idempotencyKey, allowSimilar: input.forceNew === true }),
    );
  } catch (e) {
    if (e instanceof AppError && e.code === "DUPLICATE_TICKET") return duplicateProposal(String((e.details as { ticketId: string }).ticketId), input, ctx);
    throw e;
  }
  const { result: ticket, attempts } = created;
  const view = toView(ticket, ctx.now);
  const effects: AfterEffect[] = [{ type: "link-ticket", ticketId: ticket.id }];
  let text = `Chamado ${ticket.id} criado com prioridade ${view.priorityLabel}. Prazo para a primeira resposta: ${view.slaLabel}, até ${formatDateTime(ticket.dueAt)}.`;
  if (ticket.priority === "critica") {
    effects.push({ type: "transfer", reason: "critical", label: "chamado crítico", summary: `Chamado crítico ${ticket.id}: ${ticket.title}. ${ticket.description} Afetados: ${ticket.affected}.` });
    text += " Como o caso é crítico, já estou acionando um analista para assumir agora.";
  }
  return {
    text, payload: [ticketPart(view, [])], afterEffects: effects,
    trace: { actions: [{ id: "create", tool: "create-ticket", label: `criou o chamado ${ticket.id}`, status: "done", summary: `${view.priorityLabel}, prazo ${view.slaLabel}` }], notes: retryNote(attempts) },
  };
};

export const updateTicketAction: Executor = async (input, ctx) => {
  const id = String(input.ticketId);
  if (!getTicketForRequester(id, ctx.userId)) throw notFound("Chamado");
  const { result: ticket, attempts } = await withRetry(() =>
    addTicketUpdate(id, { authorId: ctx.userId, authorRole: "employee", text: String(input.text) }, ctx.now, { idempotencyKey: ctx.idempotencyKey }));
  const view = toView(ticket, ctx.now);
  return {
    text: `Complementei o chamado ${ticket.id} com as novas informações. O prazo foi renovado: ${view.slaLabel}, até ${formatDateTime(ticket.dueAt)}.`,
    payload: [ticketPart(view, listUpdates(ticket.id))], afterEffects: [{ type: "link-ticket", ticketId: ticket.id }],
    trace: { actions: [{ id: "update", tool: "update-ticket", label: `complementou o chamado ${ticket.id}`, status: "done" }], notes: retryNote(attempts) },
  };
};

export const reopenTicketAction: Executor = async (input, ctx) => {
  const id = String(input.ticketId);
  if (!getTicketForRequester(id, ctx.userId)) throw notFound("Chamado");
  const { result: ticket, attempts } = await withRetry(() =>
    reopenTicket(id, { authorId: ctx.userId, text: String(input.text) }, ctx.now, { idempotencyKey: ctx.idempotencyKey }));
  const view = toView(ticket, ctx.now);
  return {
    text: `Reabri o chamado ${ticket.id}. Novo prazo: ${view.slaLabel}, até ${formatDateTime(ticket.dueAt)}.`,
    payload: [ticketPart(view, listUpdates(ticket.id))], afterEffects: [{ type: "link-ticket", ticketId: ticket.id }],
    trace: { actions: [{ id: "reopen", tool: "reopen-ticket", label: `reabriu o chamado ${ticket.id}`, status: "done" }], notes: retryNote(attempts) },
  };
};

export const nexoActions = { "create-ticket": createTicketAction, "update-ticket": updateTicketAction, "reopen-ticket": reopenTicketAction };
