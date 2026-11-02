import { test } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { createConversation } from "@/services/conversations/conversationService";
import { runTurn } from "@/engine/conversation/turn";
import { createStubRunner } from "./stubRunner";

const ana = () => ({ id: "emp-ana", name: "Ana Souza", email: "ana.souza@nexo.com", department: "Financeiro", role: "employee" as const });

test("stub: decide por palavras-chave, chama as tools reais e registra report-decision, sem modelo", async () => {
  useTempDb({ seed: true });
  const runner = createStubRunner();
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });

  const tickets = await runTurn({ conversationId: conv.id, user: ana(), input: { text: "como estão meus chamados?" }, runner });
  const m1 = tickets.messages[0]!;
  assert.equal(m1.trace!.source, "agent");
  assert.equal(m1.trace!.actions[0]!.label, "consultou seus chamados");
  assert.equal(m1.trace!.decision?.confidence, "alta");
  assert.ok(m1.payload!.some((p) => p.kind === "tickets"));
  assert.equal(m1.trace!.usage, undefined); // nenhum token gasto

  const help = await runTurn({ conversationId: conv.id, user: ana(), input: { text: "minha vpn dá erro 809" }, runner });
  const m2 = help.messages[0]!;
  assert.deepEqual(m2.trace!.actions.map((a) => a.label).slice(0, 1), ["buscou na central de ajuda"]);
  assert.ok(m2.payload!.some((p) => p.kind === "articles"));

  const free = await runTurn({ conversationId: conv.id, user: ana(), input: { text: "bom dia, tudo bem?" }, runner });
  assert.equal(free.messages[0]!.trace!.actions.length, 0);
  assert.match(free.messages[0]!.content, /Me conte/);
});
