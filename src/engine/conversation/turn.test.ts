import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { scriptedRunner } from "@/test/scriptedRunner";
import { getEmployee } from "@/services/employees/employeeService";
import { addMessage, createConversation, getConversation, listMessages } from "@/services/conversations/conversationService";
import { legacyGateway } from "@/services/tickets/legacyGateway";
import { runTurn } from "./turn";
import type { ChatEvent } from "./events";

const ana = () => getEmployee("emp-ana")!;
const newConv = () => createConversation({ assistantId: "nexo", employeeId: "emp-ana" });

beforeEach(() => useTempDb({ seed: true }));

test("agent consulta chamados: cards, opções, trace com ações e decisão, eventos em ordem", async () => {
  const conv = newConv();
  const events: ChatEvent[] = [];
  const runner = scriptedRunner(async (p, tool) => {
    assert.match(p.system ?? "", /Ana Souza/);
    assert.deepEqual(p.messages, [{ role: "user", content: "como está meu chamado?" }]);
    const out = (await tool("list-my-tickets", { status: "open" })) as { id: string }[];
    assert.equal(out.length, 2);
    await tool("suggest-quick-replies", { options: ["Abrir um chamado"] });
    await tool("report-decision", { understanding: "quer status", action: "listei chamados", confidence: "alta", reasoning: "regra" });
    return "Você tem 2 chamados abertos. O INC-20311 está vencido.";
  });

  const r = await runTurn({ conversationId: conv.id, user: ana(), input: { text: "como está meu chamado?" }, runner, emit: (e) => events.push(e) });
  assert.equal(r.messages.length, 1);
  const m = r.messages[0]!;
  assert.equal(m.role, "agent");
  const kinds = m.payload!.map((p) => p.kind);
  assert.deepEqual(kinds, ["tickets", "options"]);
  const options = m.payload!.find((p) => p.kind === "options")!.data as { id: string }[];
  assert.ok(options.some((o) => o.id === "inc-20311"));
  assert.ok(options.some((o) => o.id === "falar-com-um-analista")); // havia chamado vencido
  assert.ok(options.some((o) => o.id === "abrir-um-chamado"));
  assert.equal(m.trace!.source, "agent");
  assert.equal(m.trace!.actions.length, 1);
  assert.equal(m.trace!.actions[0]!.label, "consultou seus chamados");
  assert.equal(m.trace!.actions[0]!.summary, "2 chamado(s), 1 vencido(s)");
  assert.equal(m.trace!.decision?.confidence, "alta");
  assert.equal(m.trace!.usage?.inputTokens, 100);

  const types = events.map((e) => e.type);
  assert.deepEqual(types, ["message.start", "action", "action", "text.delta", "payload", "payload", "trace", "message.end", "conversation"]);
  const [a1, a2] = events.filter((e) => e.type === "action") as Extract<ChatEvent, { type: "action" }>[];
  assert.equal(a1!.action.status, "pending");
  assert.equal(a2!.action.status, "done");
  assert.equal(a1!.action.id, a2!.action.id);
  assert.equal(getConversation(conv.id)!.userMessageCount, 1);
});

test("clique em opção grava o rótulo como mensagem do usuário", async () => {
  const conv = newConv();
  addMessage(conv.id, { role: "agent", content: "?", payload: [{ kind: "options", data: [{ id: "abrir-um-chamado", label: "Abrir um chamado" }] }] });
  const runner = scriptedRunner((p) => {
    assert.equal(p.messages.at(-1)?.content, "Abrir um chamado");
    return "ok";
  });
  await runTurn({ conversationId: conv.id, user: ana(), input: { optionId: "abrir-um-chamado" }, runner });
  assert.equal(listMessages(conv.id).find((m) => m.role === "user")?.content, "Abrir um chamado");
});

test("transferência: estado waiting_analyst, mensagem de sistema e agent em pausa", async () => {
  const conv = newConv();
  let runs = 0;
  const runner = scriptedRunner(async (_p, tool) => {
    runs += 1;
    await tool("transfer-to-analyst", { reason: "user_request", summary: "Ana quer falar com alguém sobre o INC-20311 vencido." });
    return "Vou chamar um analista. Fico em pausa até ele assumir.";
  });
  const r = await runTurn({ conversationId: conv.id, user: ana(), input: { text: "quero falar com uma pessoa" }, runner });
  assert.equal(r.conversation.state, "waiting_analyst");
  assert.equal(r.conversation.transferReason, "user_request");
  assert.deepEqual(r.messages.map((m) => m.role), ["agent", "system"]);
  assert.equal(r.messages[0]!.trace!.actions[0]!.label, "transferiu para um analista");

  const r2 = await runTurn({ conversationId: conv.id, user: ana(), input: { text: "alô?" }, runner });
  assert.equal(runs, 1); // agent não roda com analista envolvido
  assert.equal(r2.messages.length, 0);
  assert.equal(listMessages(conv.id).filter((m) => m.role === "user").length, 2);
});

test("confiança baixa oferece analista; erro do legado vira nota no trace, não exceção", async () => {
  const conv = newConv();
  legacyGateway.configure({ rate: 1, durationMs: 60_000, now: () => 0 });
  const runner = scriptedRunner(async (_p, tool) => {
    const out = (await tool("get-my-ticket", { id: "INC-20311" })) as { error: string };
    assert.equal(out.error, "TICKET_SERVICE_UNAVAILABLE");
    await tool("report-decision", { understanding: "x", action: "y", confidence: "baixa", reasoning: "legado fora" });
    return "O sistema de chamados está instável, tente de novo em instantes.";
  });
  const r = await runTurn({ conversationId: conv.id, user: ana(), input: { text: "e o INC-20311?" }, runner });
  const m = r.messages[0]!;
  assert.equal(m.trace!.actions[0]!.status, "error");
  assert.deepEqual(m.trace!.notes, ["get-my-ticket: TICKET_SERVICE_UNAVAILABLE", "confiança baixa: oferecida transferência"]);
  assert.ok((m.payload!.find((p) => p.kind === "options")!.data as { id: string }[]).some((o) => o.id === "falar-com-um-analista"));
});

test("limites: conversa encerrada e limite de mensagens", async () => {
  const conv = newConv();
  const runner = scriptedRunner(() => "ok");
  for (let i = 0; i < 30; i += 1) addMessage(conv.id, { role: "user", content: `m${i}` });
  await assert.rejects(runTurn({ conversationId: conv.id, user: ana(), input: { text: "mais uma" }, runner }), { code: "MESSAGE_LIMIT" });
  const closed = newConv();
  const { updateConversation } = await import("@/services/conversations/conversationService");
  updateConversation(closed.id, { state: "closed" });
  await assert.rejects(runTurn({ conversationId: closed.id, user: ana(), input: { text: "oi" }, runner }), { code: "CONVERSATION_CLOSED" });
  await assert.rejects(runTurn({ conversationId: conv.id, user: getEmployee("emp-bruno")!, input: { text: "oi" }, runner }), { code: "NOT_FOUND" });
});
