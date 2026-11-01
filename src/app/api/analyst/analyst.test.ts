import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { as, call } from "@/test/api";
import { scriptedRunner } from "@/test/scriptedRunner";
import { setDefaultRunner } from "@/engine/conversation/turn";
import { createConversation, updateConversation } from "@/services/conversations/conversationService";
import { GET as list } from "./conversations/route";
import { GET as detail } from "./conversations/[id]/route";
import { POST as take } from "./conversations/[id]/take/route";
import { POST as reply } from "./conversations/[id]/messages/route";
import { POST as giveBack } from "./conversations/[id]/return/route";
import { POST as close } from "./conversations/[id]/close/route";
import { GET as empTickets } from "./employees/[id]/tickets/route";
import { POST as employeeSend, GET as employeePoll } from "@/app/api/conversations/[id]/messages/route";

const fabio = () => as("an-fabio", "analyst");
const gabi = () => as("an-gabriela", "analyst");

beforeEach(() => useTempDb({ seed: true }));
afterEach(() => setDefaultRunner(undefined));

test("fluxo completo: transferência → lista → assumir → responder → funcionário vê → devolver → agent volta → encerrar", async () => {
  // Funcionário pede analista; o agent transfere.
  setDefaultRunner(scriptedRunner(async (_p, tool) => {
    await tool("transfer-to-analyst", { reason: "user_request", summary: "Ana quer ajuda com o INC-20311 vencido." });
    return "Vou chamar um analista.";
  }));
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  await call(employeeSend, { headers: as("emp-ana"), params: { id: conv.id }, body: { text: "quero falar com alguém" } });

  // Só analista acessa o console.
  assert.equal((await call(list, { headers: as("emp-ana") })).status, 403);
  const l = await call(list, { headers: fabio(), url: "http://x/api?state=waiting_analyst" });
  assert.equal(l.json.length, 1);
  assert.equal(l.json[0].employee.name, "Ana Souza");
  assert.equal(l.json[0].transferSummary, "Ana quer ajuda com o INC-20311 vencido.");
  assert.ok(l.json[0].waitingSince);
  assert.equal((await call(list, { headers: fabio(), url: "http://x/api?q=bruno" })).json.length, 0);
  assert.equal((await call(list, { headers: fabio(), url: "http://x/api?q=20311" })).json.length, 1);

  // Detalhe traz histórico com trace e painel de chamados do funcionário.
  const d = await call(detail, { headers: fabio(), params: { id: conv.id } });
  assert.equal(d.json.tickets.length, 3);
  assert.equal(d.json.messages.find((m: any) => m.role === "agent").trace.actions[0].label, "transferiu para um analista");

  // Assumir: agent pausado; outro analista não pode assumir nem responder.
  const t = await call(take, { headers: fabio(), params: { id: conv.id } });
  assert.equal(t.json.conversation.state, "analyst");
  assert.equal(t.json.conversation.analyst.name, "Fábio Nunes");
  assert.equal(t.json.messages[0].role, "system");
  assert.equal((await call(take, { headers: gabi(), params: { id: conv.id } })).status, 409);
  assert.equal((await call(reply, { headers: gabi(), params: { id: conv.id }, body: { text: "oi" } })).status, 409);

  // Responder; funcionário manda mensagem (fica na fila) e vê a resposta por polling.
  const r = await call(reply, { headers: fabio(), params: { id: conv.id }, body: { text: "Olá Ana, estou vendo seu notebook agora." } });
  assert.equal(r.json.messages[0].role, "analyst");
  let agentRuns = 0;
  setDefaultRunner(scriptedRunner(() => { agentRuns += 1; return "agent respondeu"; }));
  const e = await call(employeeSend, { headers: as("emp-ana"), params: { id: conv.id }, body: { text: "obrigada!" } });
  assert.equal(e.json.messages.length, 0);
  assert.equal(agentRuns, 0);
  const poll = await call(employeePoll, { headers: as("emp-ana"), params: { id: conv.id }, url: "http://x/api?after=0" });
  assert.deepEqual(poll.json.messages.map((m: any) => m.role), ["user", "agent", "system", "system", "analyst", "user"]);

  // Devolver ao agent: ele volta a responder com o histórico do analista no contexto.
  const g = await call(giveBack, { headers: fabio(), params: { id: conv.id } });
  assert.equal(g.json.conversation.state, "agent");
  setDefaultRunner(scriptedRunner((p) => {
    assert.ok(p.messages.some((m) => m.content.includes("[Mensagem do analista humano] Olá Ana")));
    assert.match(p.system ?? "", /já passou por um analista/);
    return "De volta! Posso ajudar em mais algo?";
  }));
  const back = await call(employeeSend, { headers: as("emp-ana"), params: { id: conv.id }, body: { text: "e agora?" } });
  assert.equal(back.json.messages[0].content, "De volta! Posso ajudar em mais algo?");

  // Encerrar: funcionário não consegue mais enviar.
  const c = await call(close, { headers: fabio(), params: { id: conv.id } });
  assert.equal(c.json.conversation.state, "closed");
  assert.equal((await call(employeeSend, { headers: as("emp-ana"), params: { id: conv.id }, body: { text: "oi" } })).status, 409);
  assert.equal((await call(giveBack, { headers: fabio(), params: { id: conv.id } })).status, 409);
});

test("conversa aguardando atendente pode ser devolvida ao agent por qualquer analista, sem assumir", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  updateConversation(conv.id, { state: "waiting_analyst", transferReason: "low_confidence", transferSummary: "resumo do caso" });
  const g = await call(giveBack, { headers: gabi(), params: { id: conv.id } });
  assert.equal(g.status, 200);
  assert.equal(g.json.conversation.state, "agent");
  assert.equal(g.json.conversation.transferReason, null);
  assert.equal(g.json.conversation.transferSummary, "resumo do caso");
  assert.equal(g.json.messages[0].role, "system");
});

test("analista pode assumir conversa que ainda está com o agent (descarta flow/rascunho) e ver chamados de um funcionário", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-bruno" });
  updateConversation(conv.id, { activeFlow: { flowId: "open-ticket", data: {}, stepIndex: 0, startedAt: "" } });
  const t = await call(take, { headers: gabi(), params: { id: conv.id } });
  assert.equal(t.json.conversation.state, "analyst");
  assert.equal(t.json.conversation.activeFlowId, null);
  const tk = await call(empTickets, { headers: gabi(), params: { id: "emp-bruno" } });
  assert.deepEqual(tk.json.tickets.map((x: any) => x.id).sort(), ["INC-20287", "REQ-10398"]);
  assert.equal((await call(empTickets, { headers: as("emp-ana"), params: { id: "emp-bruno" } })).status, 403);
});
