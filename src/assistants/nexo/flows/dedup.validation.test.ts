/**
 * Regra "sem duplicidade" (Anexo A) no fluxo real: conversa → flow → rascunho → confirmação → gravação.
 * @wiki docs/brain/conventions/ServiceDeskRules.md
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { scriptedRunner } from "@/test/scriptedRunner";
import { getEmployee } from "@/services/employees/employeeService";
import { createConversation, getConversation, listMessages } from "@/services/conversations/conversationService";
import { listTickets, listUpdates } from "@/services/tickets/ticketService";
import { legacyGateway } from "@/services/tickets/legacyGateway";
import { processActionQueue } from "@/engine/actions/queue";
import { runTurn } from "@/engine/conversation/turn";
import type { Message } from "@/services/conversations/conversationService";
import type { TurnInput } from "@/engine/types";
import type { TicketDraft } from "./openTicket";

beforeEach(() => useTempDb({ seed: true }));

const neverRunner = scriptedRunner(() => { throw new Error("o agent não deveria rodar durante o flow"); });
const down = () => legacyGateway.configure({ rate: 1, durationMs: 60_000, now: () => 0 });
const up = () => legacyGateway.configure({ rate: 0 });
const draftOf = (m: Pick<Message, "payload">) => m.payload!.find((p) => p.kind === "draft")!.data as TicketDraft;
const optionIds = (m: Pick<Message, "payload">) => (m.payload!.find((p) => p.kind === "options")!.data as { id: string }[]).map((o) => o.id);

/** Conversa nova do funcionário até o rascunho (agent pré-preenche, impacto "só eu", urgência "atrapalha"). */
async function untilDraft(employeeId: string, prefill: Record<string, unknown>, beforeDraft?: () => void) {
  const user = getEmployee(employeeId)!;
  const conv = createConversation({ assistantId: "nexo", employeeId });
  const starter = scriptedRunner(async (_p, tool) => {
    await tool("start-open-ticket-flow", prefill);
    return "Vou abrir um chamado.";
  });
  await runTurn({ conversationId: conv.id, user, input: { text: "preciso abrir um chamado" }, runner: starter });
  const send = (input: TurnInput) => runTurn({ conversationId: conv.id, user, input, runner: neverRunner });
  await send({ optionId: "eu" });
  beforeDraft?.();
  const r = await send({ optionId: "atrapalha" });
  return { conv, send, message: r.messages[0]!, draft: draftOf(r.messages[0]!) };
}

const openCount = (employeeId: string, word: string) =>
  listTickets({ requesterId: employeeId }).filter((t) => t.title.toLowerCase().includes(word) && t.status !== "resolvido" && t.status !== "fechado").length;

const NOTEBOOK = { title: "Notebook lento depois da atualização do Windows", description: "Continua lento e travando.", type: "INC", category: "Hardware" };

test("1. chamado aberto parecido do mesmo funcionário → pergunta se quer complementar (não cria)", async () => {
  const { draft, message } = await untilDraft("emp-ana", NOTEBOOK);
  assert.equal(draft.mode, "update");
  assert.equal(draft.ticket?.id, "INC-20311");
  assert.match(message.content, /Você já tem o chamado INC-20311.*Confere o rascunho\?/s);
  assert.deepEqual(optionIds(message), ["confirm", "criar-um-novo-mesmo-assim", "cancel"]);
});

test("2. chamado aberto em OUTRA conversa do mesmo funcionário também conta", async () => {
  const a = await untilDraft("emp-ana", { title: "Teclado do notebook parou de funcionar", description: "Nenhuma tecla responde desde hoje.", type: "INC", category: "Hardware" });
  assert.equal(a.draft.mode, "create");
  await a.send({ optionId: "confirm" });
  const b = await untilDraft("emp-ana", { title: "Teclado do notebook não funciona", description: "As teclas não respondem.", type: "INC", category: "Hardware" });
  assert.equal(b.draft.mode, "update");
});

test("3. chamado parecido de OUTRO funcionário não conta (privacidade) → cria", async () => {
  const { draft } = await untilDraft("emp-bruno", NOTEBOOK);
  assert.equal(draft.mode, "create");
  assert.equal(draft.related.length, 0);
});

test("4. dois rascunhos do mesmo problema em conversas paralelas: o 2º confirmar vira proposta de complemento", async () => {
  const prefill = { title: "Mouse sem fio não pareia com o notebook", description: "Troquei a pilha e não pareia.", type: "INC", category: "Hardware" };
  const a = await untilDraft("emp-ana", prefill);
  const b = await untilDraft("emp-ana", prefill); // rascunho montado antes de A confirmar
  assert.equal(b.draft.mode, "create");
  await a.send({ optionId: "confirm" });
  const rb = await b.send({ optionId: "confirm" });
  assert.equal(openCount("emp-ana", "mouse"), 1);
  const m = rb.messages[0]!;
  assert.match(m.content, /encontrei o chamado INC-20400 .* não criei outro/);
  assert.equal(draftOf(m).mode, "update");
  assert.equal(getConversation(b.conv.id)!.pendingAction?.kind, "update-ticket");
  const ok = await b.send({ optionId: "confirm" });
  assert.match(ok.messages[0]!.content, /Complementei o chamado INC-20400/);
});

test("5a. sistema fora só na checagem do rascunho: avisa e a checagem é refeita ao gravar", async () => {
  const { draft, message, send } = await untilDraft("emp-ana", NOTEBOOK, down);
  assert.equal(draft.mode, "create");
  assert.match(message.content, /não consegui verificar se você já tem um chamado parecido/);
  up();
  const r = await send({ optionId: "confirm" });
  assert.equal(openCount("emp-ana", "notebook lento"), 1);
  assert.equal(draftOf(r.messages[0]!).ticket?.id, "INC-20311");
});

test("5b. sistema fora na checagem e ao confirmar: vai para a fila; ao voltar, não duplica e propõe complemento", async () => {
  const { conv, send } = await untilDraft("emp-ana", NOTEBOOK, down);
  const r = await send({ optionId: "confirm" });
  assert.match(r.messages[0]!.content, /ficou na fila/);
  up();
  await processActionQueue({ now: () => new Date(Date.now() + 60_000) });
  assert.equal(openCount("emp-ana", "notebook lento"), 1);
  const last = listMessages(conv.id).at(-1)!;
  assert.match(last.content, /O sistema de chamados voltou\. Antes de criar, encontrei o chamado INC-20311/);
  assert.equal(getConversation(conv.id)!.pendingAction?.kind, "update-ticket");
  const before = listUpdates("INC-20311").length;
  await send({ optionId: "confirm" });
  assert.equal(listUpdates("INC-20311").length, before + 1);
});

test("6a. paráfrase: o agent indica o chamado relacionado e o flow propõe complemento", async () => {
  const { draft, message } = await untilDraft("emp-ana", {
    title: "PC demorando muito pra abrir depois do update", description: "Desde o update da semana passada.", type: "INC", category: "Hardware", relatedTicketId: "inc-20311",
  });
  assert.equal(draft.mode, "update");
  assert.equal(draft.ticket?.id, "INC-20311");
  assert.match(message.trace!.decision!.reasoning, /o agent indicou que é o mesmo problema/);
});

test("7. checagem de duplicidade não mostra a lista de chamados: só o rascunho com o chamado relacionado", async () => {
  const user = getEmployee("emp-ana")!;
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const runner = scriptedRunner(async (_p, tool) => {
    await tool("list-my-tickets", { purpose: "check", status: "all" });
    await tool("start-open-ticket-flow", { ...NOTEBOOK, relatedTicketId: "INC-20311" });
    return "Vou registrar isso para você.";
  });
  const r = await runTurn({ conversationId: conv.id, user, input: { text: "meu notebook continua lento depois do update, preciso abrir chamado" }, runner });
  const intro = r.messages[0]!;
  assert.deepEqual(intro.payload ?? [], []); // nenhum card de lista, nenhum "falar com analista" do INC-20311 vencido
  assert.equal(intro.trace!.actions[0]!.label, "verificou se já existe chamado parecido");

  const send = (input: TurnInput) => runTurn({ conversationId: conv.id, user, input, runner: neverRunner });
  await send({ optionId: "eu" });
  const d = (await send({ optionId: "atrapalha" })).messages[0]!;
  const cards = d.payload!.filter((p) => p.kind === "tickets").flatMap((p) => p.data as { id: string }[]).map((t) => t.id);
  assert.deepEqual(cards, ["INC-20311"]); // só o relacionado
  assert.deepEqual(optionIds(d), ["confirm", "criar-um-novo-mesmo-assim", "cancel"]);
});

test("7b. mesmo se o agent listar em modo 'show', iniciar o flow não leva os cards da lista para a tela", async () => {
  const user = getEmployee("emp-ana")!;
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const runner = scriptedRunner(async (_p, tool) => {
    await tool("list-my-tickets", {});
    await tool("suggest-quick-replies", { options: ["Abrir outro chamado"] });
    await tool("start-open-ticket-flow", NOTEBOOK);
    return "Vou abrir um chamado.";
  });
  const r = await runTurn({ conversationId: conv.id, user, input: { text: "abrir chamado" }, runner });
  assert.deepEqual(r.messages[0]!.payload ?? [], []);
});

test("8. agent lista e prepara o complemento direto: a tela mostra só o rascunho, completo (prazo e afetados)", async () => {
  const user = getEmployee("emp-ana")!;
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const runner = scriptedRunner(async (_p, tool) => {
    await tool("list-my-tickets", {}); // modo "show"
    await tool("add-ticket-update", { ticketId: "INC-20311", text: "Continua lento e agora trava no Teams." });
    return "Já existe um chamado aberto sobre isso. Preparei um complemento.";
  });
  const r = await runTurn({ conversationId: conv.id, user, input: { text: "notebook continua lento" }, runner });
  const m = r.messages[0]!;
  assert.deepEqual(m.payload!.map((p) => p.kind), ["draft", "options"]); // sem a lista de chamados
  const d = draftOf(m);
  assert.equal(d.ticket?.id, "INC-20311");
  assert.ok(!Number.isNaN(new Date(d.dueAt).getTime()), `prazo inválido: ${d.dueAt}`);
  assert.equal(d.slaLabel, "3 dias úteis");
  assert.equal(d.affected, "Só eu");
  assert.equal(d.priority, "media"); // a do chamado existente
});

test("6b. indicação do agent é conferida: chamado de outro funcionário é ignorado", async () => {
  const { draft, message } = await untilDraft("emp-ana", {
    title: "VPN caindo toda hora", description: "Cai a cada 10 minutos.", type: "INC", category: "Rede e VPN", relatedTicketId: "INC-20287", // do Bruno
  });
  assert.equal(draft.mode, "create");
  assert.ok(message.trace!.notes!.some((n) => n.includes("indicação do agent ignorada: INC-20287")));
});
