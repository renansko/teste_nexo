/**
 * Abertura de chamado de ponta a ponta pelo orquestrador: tool open-ticket (human-in-the-loop) → perguntas
 * com a run suspensa → rascunho → confirmação → efeito. "Editar X" do rascunho continua pelo flow determinístico.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { scriptedRunner } from "@/test/scriptedRunner";
import { getEmployee } from "@/services/employees/employeeService";
import { createConversation, getConversation, listMessages } from "@/services/conversations/conversationService";
import { getTicket, listTickets, listUpdates } from "@/services/tickets/ticketService";
import { legacyGateway } from "@/services/tickets/legacyGateway";
import { closeDb, getDb } from "@/lib/db";
import { getQueuedAction, listQueuedActions, processActionQueue } from "@/engine/actions/queue";
import { runTurn } from "@/engine/conversation/turn";
import { takeConversation } from "@/engine/conversation/state";
import type { ChatEvent } from "@/engine/conversation/events";
import type { TurnInput } from "@/engine/types";
import type { TicketDraft } from "./openTicket";

const ana = () => getEmployee("emp-ana")!;

beforeEach(() => useTempDb({ seed: true }));

/**
 * Agent: no primeiro turno chama open-ticket com o pré-preenchimento. Nos turnos seguintes só roda ao retomar
 * a run (a tool já foi reexecutada com a resposta); se a tool concluiu, responde com o rascunho.
 */
function agent(prefill: Record<string, unknown>) {
  return scriptedRunner(async (p, tool) => {
    if (p.resume) {
      await tool("report-decision", { understanding: "abrir chamado", action: "montei o rascunho", confidence: "alta", reasoning: "dados completos" });
      return "Aqui está o rascunho do chamado. Posso criar?";
    }
    if (p.messages.at(-1)?.content !== "preciso abrir um chamado") throw new Error("o agent não deveria rodar fora do início e da retomada");
    await tool("open-ticket", prefill);
    return "Vou abrir um chamado para isso.";
  });
}
const start = (conversationId: string, prefill: Record<string, unknown>, emit?: (e: ChatEvent) => void) =>
  runTurn({ conversationId, user: ana(), input: { text: "preciso abrir um chamado" }, runner: agent(prefill), emit });
const send = (conversationId: string, input: TurnInput) => runTurn({ conversationId, user: ana(), input, runner: agent({}) });
const optionIds = (m: { payload: { kind: string; data: unknown }[] | null }) => (m.payload!.find((p) => p.kind === "options")!.data as { id: string }[]).map((o) => o.id);
const draftOf = (m: { payload: { kind: string; data: unknown }[] | null }) => m.payload!.find((p) => p.kind === "draft")!.data as TicketDraft;

test("pré-preenchido: a tool pergunta impacto e urgência com a run suspensa, devolve o rascunho, cria após confirmar; sobrevive a reinício", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const events: ChatEvent[] = [];
  const r1 = await start(conv.id, { title: "Teclado do notebook parou de funcionar", description: "Desde hoje cedo nenhuma tecla responde; já reiniciei.", type: "INC", category: "Hardware" }, (e) => events.push(e));
  assert.deepEqual(r1.messages.map((m) => m.role), ["agent"]);
  assert.match(r1.messages[0]!.content, /Vou abrir um chamado para você/); // intro do flow só na primeira pergunta
  assert.match(r1.messages[0]!.content, /Quantas pessoas isso afeta\?/);
  assert.deepEqual(optionIds(r1.messages[0]!), ["eu", "equipe", "empresa", "cancel"]);
  assert.equal(r1.conversation.suspendedRun?.toolId, "open-ticket");
  assert.equal(r1.conversation.activeFlow, null);
  const action = r1.messages[0]!.trace!.actions[0]!;
  assert.equal(action.label, "montou o chamado");
  assert.equal(action.status, "pending");
  assert.match(action.summary ?? "", /perguntou: Quantas pessoas/);
  assert.deepEqual(events.map((e) => e.type), ["message.start", "action", "action", "payload", "trace", "message.end", "conversation"]);

  closeDb(); // reinício no meio da pergunta: a run suspensa está persistida

  const r2 = await send(conv.id, { optionId: "eu" });
  assert.match(r2.messages[0]!.content, /urgência/);
  assert.doesNotMatch(r2.messages[0]!.content, /Vou abrir um chamado para você/);
  const r3 = await send(conv.id, { text: "Parou, não consigo trabalhar" }); // rótulo digitado em vez de clique
  assert.equal(r3.messages[0]!.content, "Aqui está o rascunho do chamado. Posso criar?");
  const draft = draftOf(r3.messages[0]!);
  assert.equal(draft.mode, "create");
  assert.equal(draft.priority, "alta");
  assert.equal(draft.affected, "Só eu");
  assert.deepEqual(optionIds(r3.messages[0]!), ["confirm", "edit:description", "edit:impact", "cancel"]);
  assert.equal(r3.messages[0]!.trace!.actions.map((a) => a.label).join(","), "montou o chamado,classificou a prioridade,verificou duplicidade");
  assert.equal(r3.messages[0]!.trace!.decision?.confidence, "alta");
  assert.equal(r3.conversation.suspendedRun, null);
  assert.ok(r3.conversation.pendingAction);

  const r4 = await send(conv.id, { optionId: "confirm" });
  assert.match(r4.messages[0]!.content, /Chamado INC-20400 criado com prioridade Alta/);
  assert.equal(r4.messages[0]!.trace!.source, "action");
  assert.equal(r4.conversation.pendingAction, null);
  assert.equal(r4.conversation.ticketId, "INC-20400");
  assert.equal(getTicket("INC-20400")?.requesterId, "emp-ana");
});

test("sem pré-preenchimento: pergunta tipo, título, descrição, categoria; resposta inválida repete; cancelar no meio", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const r1 = await start(conv.id, {});
  assert.match(r1.messages[0]!.content, /O que aconteceu\?/);
  const r2 = await send(conv.id, { optionId: "REQ" });
  assert.match(r2.messages[0]!.content, /qual é o problema ou pedido/);
  const r3 = await send(conv.id, { text: "x" });
  assert.match(r3.messages[0]!.content, /mais de detalhe/); // validação
  const r4 = await send(conv.id, { text: "Licença do Figma" });
  assert.match(r4.messages[0]!.content, /Me conta um pouco mais/);
  const r5 = await send(conv.id, { text: "Preciso para o novo projeto de marketing" });
  assert.match(r5.messages[0]!.content, /categoria/);
  const r6 = await send(conv.id, { text: "abc" });
  assert.match(r6.messages[0]!.content, /Não entendi. Escolha uma das opções/);
  const r7 = await send(conv.id, { text: "cancelar" });
  assert.match(r7.messages[0]!.content, /não vou abrir/);
  assert.equal(r7.messages[0]!.trace!.source, "rule");
  assert.equal(getConversation(conv.id)!.suspendedRun, null);
});

test("analista assumir a conversa descarta a pergunta pendente", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  await start(conv.id, {});
  assert.ok(getConversation(conv.id)!.suspendedRun);
  takeConversation(conv.id, getEmployee("an-fabio")!);
  assert.equal(getConversation(conv.id)!.suspendedRun, null);
});

test("duplicidade: propõe complementar o chamado aberto parecido; confirmar renova o prazo", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  await start(conv.id, { title: "Notebook lento depois da atualização do Windows", description: "Continua lento, agora trava também no Teams.", type: "INC", category: "Hardware" });
  await send(conv.id, { optionId: "eu" });
  const r = await send(conv.id, { optionId: "atrapalha" });
  const draft = draftOf(r.messages[0]!);
  assert.equal(draft.mode, "update");
  assert.equal(draft.ticket?.id, "INC-20311");
  assert.ok(r.messages[0]!.payload!.some((p) => p.kind === "tickets"));
  assert.ok(optionIds(r.messages[0]!).includes("criar-um-novo-mesmo-assim"));
  const before = getTicket("INC-20311")!.dueAt;
  const c = await send(conv.id, { text: "sim" });
  assert.match(c.messages[0]!.content, /Complementei o chamado INC-20311/);
  assert.equal(listUpdates("INC-20311").at(-1)?.text, "Continua lento, agora trava também no Teams.");
  assert.notEqual(getTicket("INC-20311")!.dueAt, before);
});

test("reabertura: chamado resolvido há 4 dias parecido vira rascunho de reabertura", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  await start(conv.id, { title: "Senha do SAP bloqueada de novo", description: "Bloqueou de novo o usuário ASOUZA.", type: "INC", category: "Acesso" });
  await send(conv.id, { optionId: "eu" });
  const r = await send(conv.id, { optionId: "parado" });
  assert.equal(draftOf(r.messages[0]!).mode, "reopen");
  const c = await send(conv.id, { optionId: "confirm" });
  assert.match(c.messages[0]!.content, /Reabri o chamado INC-20150/);
  assert.equal(getTicket("INC-20150")?.status, "aberto");
});

test("editar prioridade reabre o passo pelo flow determinístico; caso crítico transfere automaticamente ao criar", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  await start(conv.id, { title: "Sistema de faturamento fora do ar", description: "Ninguém do financeiro consegue emitir notas desde as 9h.", type: "INC", category: "Software" });
  await send(conv.id, { optionId: "eu" });
  const r1 = await send(conv.id, { optionId: "parado" });
  assert.equal(draftOf(r1.messages[0]!).priority, "alta");
  const r2 = await send(conv.id, { optionId: "edit:impact" });
  assert.match(r2.messages[0]!.content, /Quantas pessoas/);
  assert.equal(r2.messages[0]!.trace!.source, "flow");
  assert.equal(r2.conversation.activeFlow?.flowId, "open-ticket");
  await send(conv.id, { optionId: "equipe" });
  await send(conv.id, { optionId: "parado" });
  const r3 = await send(conv.id, { text: "todo o financeiro" });
  const draft = draftOf(r3.messages[0]!);
  assert.equal(draft.priority, "critica");
  assert.equal(draft.affected, "todo o financeiro");
  const c = await send(conv.id, { optionId: "confirm" });
  assert.deepEqual(c.messages.map((m) => m.role), ["agent", "system"]);
  assert.equal(c.conversation.state, "waiting_analyst");
  assert.equal(c.conversation.transferReason, "critical");
  assert.match(c.conversation.transferSummary ?? "", /INC-20400/);
  // Transferir a conversa transfere o chamado vinculado no sistema simulado; assumir o traz para atendimento.
  assert.equal(getTicket("INC-20400")!.status, "aguardando_analista");
  takeConversation(conv.id, getEmployee("an-fabio")!);
  assert.equal(getTicket("INC-20400")!.status, "em_atendimento");
});

test("transferência com o legado fora não falha: a conversa muda de estado e o chamado fica como estava", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  await start(conv.id, { title: "Teclado do notebook parou de funcionar", description: "Nenhuma tecla responde desde cedo.", type: "INC", category: "Hardware" });
  await send(conv.id, { optionId: "eu" });
  await send(conv.id, { optionId: "parado" });
  await send(conv.id, { optionId: "confirm" });
  assert.equal(getConversation(conv.id)!.ticketId, "INC-20400");
  legacyGateway.configure({ rate: 1, durationMs: 60_000, now: () => 0 });
  const runner = scriptedRunner(async (_p, tool) => {
    await tool("transfer-to-analyst", { reason: "user_request", summary: "Ana quer falar com um analista sobre o INC-20400." });
    return "Vou chamar um analista.";
  });
  const r = await runTurn({ conversationId: conv.id, user: ana(), input: { text: "quero um analista" }, runner });
  assert.equal(r.conversation.state, "waiting_analyst");
  legacyGateway.configure({ rate: 0 });
  assert.equal(getTicket("INC-20400")!.status, "aberto"); // gancho best-effort: não aplicou, não quebrou
});

test("sistema legado fora ao confirmar: pedido vai para a fila, é registrado quando volta e reprocessar não duplica", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  await start(conv.id, { title: "Mouse sem fio não pareia", description: "Troquei a pilha e nada.", type: "INC", category: "Hardware" });
  await send(conv.id, { optionId: "eu" });
  await send(conv.id, { optionId: "atrapalha" });
  legacyGateway.configure({ rate: 1, durationMs: 60_000, now: () => 0 });
  const r = await send(conv.id, { optionId: "confirm" });
  assert.match(r.messages[0]!.content, /ficou na fila/);
  assert.equal(getConversation(conv.id)!.pendingAction, null); // já confirmado: não pede de novo
  const [queued] = listQueuedActions({ conversationId: conv.id });
  assert.equal(queued?.status, "queued");
  assert.equal(queued?.kind, "create-ticket");

  const later = (min: number) => () => new Date(Date.now() + min * 60_000);
  assert.deepEqual(await processActionQueue({ now: later(1) }), { done: 0, retried: 1, failed: 0 }); // ainda fora
  legacyGateway.configure({ rate: 0 });
  assert.deepEqual(await processActionQueue({ now: later(10) }), { done: 1, retried: 0, failed: 0 });

  const last = listMessages(conv.id).at(-1)!;
  assert.match(last.content, /O sistema de chamados voltou\. Chamado INC-20400 criado/);
  assert.ok(last.trace!.notes!.some((n) => n.startsWith("executado pela fila")));
  assert.equal(getConversation(conv.id)!.ticketId, "INC-20400");
  assert.equal(getQueuedAction(queued!.id)?.status, "done");

  // Reprocessar (ex.: worker caiu depois de gravar e o item voltou para a fila) não cria de novo: mesma chave.
  getDb().prepare(`UPDATE action_queue SET status = 'queued', next_attempt_at = '1970-01-01T00:00:00.000Z' WHERE id = ?`).run(queued!.id);
  await processActionQueue({ now: later(20) });
  assert.equal(listTickets({ requesterId: "emp-ana" }).filter((t) => t.title === "Mouse sem fio não pareia").length, 1);
});

test("fora do escopo de TI: open-ticket recusa sem perguntar nem gravar; o agent orienta", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const before = listTickets({ requesterId: "emp-ana" }).length;
  const runner = scriptedRunner(async (_p, tool) => {
    const out = (await tool("open-ticket", { title: "Férias não apareceram no holerite", description: "Tirei férias em outubro e o holerite veio sem o valor.", type: "REQ", category: "Outros" })) as { refused?: string; message?: string };
    assert.equal(out.refused, "OUT_OF_SCOPE");
    assert.match(out.message ?? "", /RH/);
    await tool("report-decision", { understanding: "dúvida de folha de pagamento", action: "orientei a procurar o RH", confidence: "alta", reasoning: "Anexo A: só TI" });
    return "Isso é com o RH: fale com o portal de RH ou rh@nexo.com.";
  });
  const r = await runTurn({ conversationId: conv.id, user: ana(), input: { text: "minhas férias não apareceram no holerite" }, runner });
  const c = getConversation(conv.id)!;
  assert.equal(c.suspendedRun, null);
  assert.equal(c.pendingAction, null);
  assert.equal(c.activeFlow, null);
  assert.equal(listTickets({ requesterId: "emp-ana" }).length, before);
  const action = r.messages[0]!.trace!.actions.find((a) => a.tool === "open-ticket")!;
  assert.equal(action.label, "recusou chamado fora do escopo de TI");
  assert.equal(action.status, "done");
  assert.match(action.summary ?? "", /assunto de RH/);
});
