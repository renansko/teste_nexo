/**
 * Tools que mudam chamados: nenhuma executa direto; todas terminam num rascunho para confirmação.
 * `open-ticket` é human-in-the-loop: pergunta o que falta suspendendo a run do agent (ver HumanInTheLoop).
 * @wiki docs/brain/services/HumanInTheLoop.md
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { FlowData, FlowOutcomeOutput, PendingAction, ResumeAnswer, SuspendPrompt, ToolSpec } from "@/engine/types";
import { answerStep, nextStepIndex, questionFor } from "@/engine/flows/runner";
import { hitl } from "@/engine/tools/hitl";
import { notFound } from "@/lib/errors";
import { assertCanReopen, assertCanUpdate, getTicketForRequester, toView } from "@/services/tickets/ticketService";
import { withRetry } from "@/services/tickets/legacyGateway";
import { TICKET_CATEGORIES } from "@/services/tickets/types";
import { currentUserId, turnContext } from "./context";
import { openTicketFlow, TYPE_LABEL, type TicketDraft } from "../flows/openTicket";

/** Mesmo formato de `SuspendPrompt` (o engine renderiza `text` + `options`; `stepKey`/`data` voltam para a tool). */
const suspendSchema = z.object({
  text: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  stepKey: z.string().optional(),
  data: z.record(z.string(), z.string()).optional(),
  cancelText: z.string().optional(),
});
const resumeSchema = z.object({ text: z.string().optional(), optionId: z.string().optional() });

type OpenInput = { title?: string; description?: string; type?: "INC" | "REQ"; category?: (typeof TICKET_CATEGORIES)[number]; forceNew?: boolean };

/** Dados iniciais do chat-formulário a partir do que o agent extraiu da conversa. */
function prefill(input: OpenInput): FlowData {
  const data: FlowData = {};
  if (input.title) data.title = input.title;
  if (input.description) data.description = input.description;
  if (input.type) data.type = input.type;
  if (input.category) data.category = input.category;
  if (input.forceNew) data.force_new = "1";
  return data;
}

/** Pergunta do passo `index` no formato do `suspend`. Só a primeira pergunta leva a introdução do flow. */
function promptFor(data: FlowData, index: number, prefix?: string): SuspendPrompt {
  const q = questionFor(openTicketFlow, data, index, prefix);
  return { text: q.text, options: q.options, stepKey: openTicketFlow.steps[index]!.key, data, cancelText: openTicketFlow.cancelText };
}

export const openTicket: ToolSpec<OpenInput, FlowOutcomeOutput | undefined> = {
  label: "montou o chamado",
  tool: createTool({
    id: "open-ticket",
    description: "Abre um chamado. Preencha o que o funcionário JÁ disse (título, descrição, tipo, categoria); deixe vazio o que não tiver certeza. Se faltar algo, a tool faz a pergunta ao funcionário e a conversa pausa até ele responder (não chame report-decision antes dela). Ao final ela classifica a prioridade, verifica duplicidade e devolve um rascunho para confirmação.",
    inputSchema: z.object({
      title: z.string().min(5).max(120).optional().describe("Resumo do problema em uma frase, se já souber"),
      description: z.string().min(10).max(2000).optional().describe("Descrição com o que acontece, desde quando e o que já foi tentado"),
      type: z.enum(["INC", "REQ"]).optional().describe("INC: algo parou/não funciona; REQ: pedido de acesso, equipamento ou software"),
      category: z.enum(TICKET_CATEGORIES).optional(),
      forceNew: z.boolean().optional().describe("true quando o funcionário quer um chamado novo apesar de existir um parecido"),
    }),
    suspendSchema,
    resumeSchema,
    execute: async (input, context) => {
      const ctx = turnContext(context);
      const { suspend, suspendPayload: suspended, resumeData: answer } = hitl<SuspendPrompt, ResumeAnswer>(context);
      let data: FlowData = { ...(suspended?.data ?? prefill(input)) };
      let from = 0;

      if (suspended && answer) {
        // Retomada: a tool roda de novo com o input original; o progresso vem do payload da suspensão.
        const index = openTicketFlow.steps.findIndex((s) => s.key === suspended.stepKey);
        const step = openTicketFlow.steps[index];
        if (!step) throw new Error(`passo desconhecido: ${suspended.stepKey}`);
        const r = answerStep(step, data, answer);
        if ("error" in r) {
          await suspend?.(promptFor(data, index, r.error));
          return;
        }
        data = { ...data, [step.key]: r.value };
        from = index + 1;
      }

      const next = nextStepIndex(openTicketFlow, data, from);
      if (next < openTicketFlow.steps.length) {
        const intro = suspended ? undefined : (typeof openTicketFlow.intro === "function" ? openTicketFlow.intro(data) : openTicketFlow.intro);
        await suspend?.(promptFor(data, next, intro));
        return;
      }
      return { outcome: await openTicketFlow.onComplete(data, ctx) };
    },
  }),
  summarize: (input, out) => {
    if (!out) return undefined;
    const keys = Object.keys(prefill(input)).filter((k) => k !== "force_new");
    return keys.length ? `pré-preenchido: ${keys.join(", ")}` : "sem pré-preenchimento";
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
      assertCanUpdate(ticket);
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
      assertCanReopen(ticket, now);
      const view = toView(ticket, now);
      const draft: Partial<TicketDraft> = { mode: "reopen", ticket: view, text: reason, title: view.title, type: view.type, typeLabel: TYPE_LABEL[view.type], category: view.category, priority: view.priority, priorityLabel: view.priorityLabel, related: [] };
      return { kind: "reopen-ticket", label: `reabrir o chamado ${ticket.id}`, input: { ticketId: ticket.id, text: reason }, draft, createdAt: now.toISOString() };
    },
  }),
};
