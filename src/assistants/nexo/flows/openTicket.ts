/**
 * Flow determinístico de abertura de chamado (chat-formulário). Pergunta só o que o agent não pré-preencheu,
 * classifica a prioridade pela matriz do Anexo A, verifica duplicidade/reabertura e monta o rascunho
 * que fica aguardando confirmação. Nenhuma chamada de LLM.
 * @wiki docs/brain/services/FlowEngine.md
 */
import type { FlowData, FlowDefinition, PendingAction, QuickOption, Trace, TraceAction } from "@/engine/types";
import { EDIT_PREFIX } from "@/engine/actions/pending";
import { IMPACT_LABEL, IMPACTS, priorityFor, URGENCIES, URGENCY_LABEL, type Impact, type Urgency } from "@/services/tickets/priority";
import { computeDueAt, SLA_LABEL } from "@/services/tickets/sla";
import { findRelatedTickets, getTicketForRequester, toView, type TicketView } from "@/services/tickets/ticketService";
import { canReopen, type RelatedTicket } from "@/services/tickets/dedup";
import { withRetry } from "@/services/tickets/legacyGateway";
import { isOpenStatus, PRIORITY_LABEL, TICKET_CATEGORIES, type TicketCategory, type TicketPriority, type TicketType } from "@/services/tickets/types";
import { ticketsPart } from "../payload";

export const OPEN_TICKET_FLOW = "open-ticket";

export const TYPE_LABEL: Record<TicketType, string> = { INC: "Incidente", REQ: "Requisição" };

/** Rascunho exibido ao funcionário (payload `draft`). */
export interface TicketDraft {
  mode: "create" | "update" | "reopen";
  title: string;
  description: string;
  type: TicketType;
  typeLabel: string;
  category: TicketCategory;
  priority: TicketPriority;
  priorityLabel: string;
  priorityReason: string;
  slaLabel: string;
  dueAt: string;
  affected: string;
  /** Chamado alvo quando `mode` é update/reopen. */
  ticket?: TicketView;
  /** Texto do complemento (update) ou motivo (reopen). */
  text?: string;
  related: TicketView[];
}

const has = (k: string) => (d: FlowData) => !!d[k];
const CATEGORY_OPTIONS: QuickOption[] = TICKET_CATEGORIES.map((c) => ({ id: c, label: c }));

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const openTicketFlow: FlowDefinition = {
  id: OPEN_TICKET_FLOW,
  intro: "Vou abrir um chamado para você. Preciso confirmar alguns detalhes rapidinho.",
  cancelText: "Ok, não vou abrir o chamado. Se precisar de outra coisa, é só falar.",
  steps: [
    {
      key: "type", type: "choice", skipIf: has("type"),
      prompt: "O que aconteceu?",
      options: [
        { id: "INC", label: "Algo parou ou não funciona" },
        { id: "REQ", label: "Preciso de acesso, equipamento ou software" },
      ],
    },
    { key: "title", type: "text", skipIf: has("title"), prompt: "Em uma frase, qual é o problema ou pedido?", validate: (v) => (v.length < 5 ? "Pode descrever com um pouco mais de detalhe?" : undefined) },
    { key: "description", type: "text", skipIf: has("description"), prompt: "Me conta um pouco mais: o que acontece, desde quando e o que você já tentou?" },
    { key: "category", type: "choice", skipIf: has("category"), prompt: "Qual categoria descreve melhor?", options: CATEGORY_OPTIONS },
    { key: "impact", type: "choice", prompt: "Quantas pessoas isso afeta?", options: IMPACTS.map((id) => ({ id, label: IMPACT_LABEL[id] })) },
    { key: "urgency", type: "choice", prompt: "E qual é a urgência?", options: URGENCIES.map((id) => ({ id, label: URGENCY_LABEL[id] })) },
    { key: "affected", type: "text", skipIf: (d) => d.impact === "eu", prompt: "Quem é afetado? (ex.: equipe de Vendas, 3º andar, toda a empresa)" },
  ],

  async onComplete(data, ctx) {
    const started = Date.now();
    const actions: TraceAction[] = [];
    const notes: string[] = [];
    const type = data.type as TicketType;
    const category = data.category as TicketCategory;
    const { priority, reason } = priorityFor(data.impact as Impact, data.urgency as Urgency);
    const dueAt = computeDueAt(priority, ctx.now).toISOString();
    actions.push({ id: "prio", tool: "priority-rule", label: "classificou a prioridade", status: "done", summary: `${PRIORITY_LABEL[priority]}: ${reason}` });

    let related: RelatedTicket[] = [];
    let dedupChecked = true;
    /** Chamado que o agent indicou como "o mesmo problema" (pega paráfrases); conferido aqui, nunca aceito às cegas. */
    let hinted: RelatedTicket | undefined;
    if (data.force_new !== "1") {
      try {
        const r = await withRetry(() => findRelatedTickets(ctx.userId, { title: data.title!, description: data.description, category }, ctx.now));
        related = r.result;
        if (r.attempts > 1) notes.push(`sistema de chamados instável: ${r.attempts} tentativas`);
        if (data.related_hint) {
          const t = (await withRetry(() => getTicketForRequester(data.related_hint!, ctx.userId))).result;
          const kind = t && (isOpenStatus(t.status) ? "duplicate" : canReopen(t, ctx.now) ? "reopenable" : undefined);
          if (t && kind) {
            hinted = { ticket: t, score: 1, kind };
            related = [hinted, ...related.filter((x) => x.ticket.id !== t.id)];
          } else {
            notes.push(`indicação do agent ignorada: ${data.related_hint} não é chamado aberto (ou resolvido há até 7 dias) deste funcionário`);
          }
        }
        actions.push({ id: "dedup", tool: "dedup-rule", label: "verificou duplicidade", status: "done", summary: related.length ? `${related.length} chamado(s) parecido(s): ${related.map((x) => x.ticket.id).join(", ")}${hinted ? ` (${hinted.ticket.id} indicado pelo agent)` : ""}` : "nenhum chamado parecido" });
      } catch {
        dedupChecked = false;
        notes.push("não foi possível verificar duplicidade (sistema de chamados indisponível); a checagem é refeita ao gravar");
        actions.push({ id: "dedup", tool: "dedup-rule", label: "verificou duplicidade", status: "error", summary: "sistema de chamados indisponível" });
      }
    } else {
      notes.push("funcionário pediu um chamado novo apesar de parecido existente");
    }
    const why = (r: RelatedTicket) => (r === hinted ? "o agent indicou que é o mesmo problema (conferido: é deste funcionário)" : `similaridade ${r.score.toFixed(2)}`);

    const base: Omit<TicketDraft, "mode"> = {
      title: data.title!, description: data.description!, type, typeLabel: TYPE_LABEL[type], category,
      priority, priorityLabel: PRIORITY_LABEL[priority], priorityReason: reason, slaLabel: SLA_LABEL[priority], dueAt,
      affected: data.impact === "eu" ? "Só eu" : data.affected ?? IMPACT_LABEL[data.impact as Impact],
      related: related.map((r) => toView(r.ticket, ctx.now)),
    };
    const flowSnapshot = { flowId: OPEN_TICKET_FLOW, data };
    const editOptions: QuickOption[] = [
      { id: `${EDIT_PREFIX}description`, label: "Editar descrição" },
      { id: `${EDIT_PREFIX}impact`, label: "Editar prioridade" },
    ];
    const trace = (understanding: string, action: string, reasoning: string): Partial<Trace> => ({
      actions, notes, durationMs: Date.now() - started,
      decision: { understanding, action, confidence: "alta", reasoning },
    });

    const dup = related.find((r) => r.kind === "duplicate");
    if (dup) {
      const ticket = toView(dup.ticket, ctx.now);
      const draft: TicketDraft = { ...base, mode: "update", ticket, text: data.description! };
      const pendingAction: PendingAction = {
        kind: "update-ticket", label: `complementar o chamado ${ticket.id}`,
        input: { ticketId: ticket.id, text: data.description!, flow: flowSnapshot }, draft,
        extraOptions: [{ id: "criar-um-novo-mesmo-assim", label: "Criar um novo mesmo assim" }],
        createdAt: ctx.now.toISOString(),
      };
      return {
        text: `Você já tem o chamado ${ticket.id} (${ticket.title}) ${ticket.statusLabel.toLowerCase()}${ticket.overdue ? ", e ele está vencido" : ""}. Para não duplicar, proponho complementá-lo com o que você me contou agora. Confere o rascunho?`,
        payload: [ticketsPart([ticket])], pendingAction,
        trace: trace("abrir chamado sobre um problema que já tem chamado aberto", "propôs complementar o chamado existente", `Anexo A: sem duplicidade; ${ticket.id} é parecido (${why(dup)})`),
      };
    }

    const reopen = related.find((r) => r.kind === "reopenable");
    if (reopen) {
      const ticket = toView(reopen.ticket, ctx.now);
      const draft: TicketDraft = { ...base, mode: "reopen", ticket, text: data.description! };
      const pendingAction: PendingAction = {
        kind: "reopen-ticket", label: `reabrir o chamado ${ticket.id}`,
        input: { ticketId: ticket.id, text: data.description!, flow: flowSnapshot }, draft,
        extraOptions: [{ id: "criar-um-novo-mesmo-assim", label: "Criar um novo mesmo assim" }],
        createdAt: ctx.now.toISOString(),
      };
      return {
        text: `O chamado ${ticket.id} (${ticket.title}) foi resolvido há poucos dias e parece ser o mesmo problema. Posso reabri-lo em vez de criar um novo. Confere o rascunho?`,
        payload: [ticketsPart([ticket])], pendingAction,
        trace: trace("abrir chamado sobre problema resolvido recentemente", "propôs reabrir o chamado", `Anexo A: resolvidos há até 7 dias podem ser reabertos; ${ticket.id} é parecido (${why(reopen)})`),
      };
    }

    const draft: TicketDraft = { ...base, mode: "create" };
    const pendingAction: PendingAction = {
      kind: "create-ticket", label: "criar o chamado",
      input: { title: draft.title, description: draft.description, type, category, priority, affected: draft.affected, forceNew: data.force_new === "1", flow: flowSnapshot }, draft,
      extraOptions: editOptions, createdAt: ctx.now.toISOString(),
    };
    const lines = [
      `Rascunho do chamado:`,
      `• ${TYPE_LABEL[type]} · ${category}`,
      `• Título: ${draft.title}`,
      `• Prioridade ${PRIORITY_LABEL[priority]} (${reason}) · prazo ${SLA_LABEL[priority]}, até ${formatDateTime(dueAt)}`,
      `• Afetados: ${draft.affected}`,
      ...(dedupChecked ? [] : ["O sistema de chamados está instável e não consegui verificar se você já tem um chamado parecido; confiro de novo na hora de gravar."]),
      `Posso criar?`,
    ];
    return {
      text: lines.join("\n"), pendingAction,
      trace: trace("abrir um chamado novo", "montou o rascunho e pediu confirmação", `prioridade pela matriz impacto × urgência (${IMPACT_LABEL[data.impact as Impact]} + ${URGENCY_LABEL[data.urgency as Urgency]}); sem chamado parecido`),
    };
  },
};
