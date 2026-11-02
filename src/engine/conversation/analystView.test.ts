/** Console por funcionário: várias conversas da mesma pessoa viram um item (a ativa) e um chat único no detalhe. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { as, call } from "@/test/api";
import { GET as listRoute } from "@/app/api/analyst/conversations/route";
import { GET as detailRoute } from "@/app/api/analyst/conversations/[id]/route";
import { addMessage, createConversation, updateConversation } from "@/services/conversations/conversationService";
import { activeConversation, employeeThread, listForAnalyst } from "./analystView";

beforeEach(() => useTempDb({ seed: true }));

const at = (iso: string) => new Date(iso);

test("lista: um item por funcionário, a conversa que mais precisa do analista; threadSize conta todas", () => {
  const old = createConversation({ assistantId: "nexo", employeeId: "emp-ana" }, at("2026-03-01T10:00:00Z"));
  addMessage(old.id, { role: "user", content: "teclado parou" }, at("2026-03-01T10:01:00Z"));
  const waiting = createConversation({ assistantId: "nexo", employeeId: "emp-ana" }, at("2026-03-01T11:00:00Z"));
  addMessage(waiting.id, { role: "user", content: "notebook não liga" }, at("2026-03-01T11:01:00Z"));
  updateConversation(waiting.id, { state: "waiting_analyst", transferReason: "user_request" }, at("2026-03-01T11:02:00Z"));
  const newest = createConversation({ assistantId: "nexo", employeeId: "emp-ana" }, at("2026-03-01T12:00:00Z"));
  addMessage(newest.id, { role: "user", content: "aaaa" }, at("2026-03-01T12:01:00Z"));

  const ana = listForAnalyst({}).filter((i) => i.employeeId === "emp-ana");
  assert.equal(ana.length, 1, "uma linha por funcionário");
  assert.equal(ana[0]?.id, waiting.id, "a que aguarda analista vence a mais recente com o agent");
  assert.equal(ana[0]?.threadSize, 3);

  assert.equal(activeConversation([old, newest])?.id, newest.id, "empate de estado: a mais recente");
  assert.equal(listForAnalyst({ state: "agent" }).some((i) => i.employeeId === "emp-ana"), false, "filtro de estado olha a ativa");
  assert.equal(listForAnalyst({ q: "notebook" }).some((i) => i.employeeId === "emp-ana"), true);
});

test("detalhe: thread traz as outras conversas da mais antiga para a mais nova, sem a aberta", async () => {
  const a = createConversation({ assistantId: "nexo", employeeId: "emp-bruno" }, at("2026-03-01T10:00:00Z"));
  addMessage(a.id, { role: "user", content: "primeira" }, at("2026-03-01T10:01:00Z"));
  const b = createConversation({ assistantId: "nexo", employeeId: "emp-bruno" }, at("2026-03-01T11:00:00Z"));
  addMessage(b.id, { role: "user", content: "segunda" }, at("2026-03-01T11:01:00Z"));

  assert.deepEqual(employeeThread("emp-bruno", b.id).map((s) => s.conversation.id), [a.id]);
  const r = await call(detailRoute, { headers: as("an-fabio", "analyst"), params: { id: b.id } });
  assert.equal(r.status, 200);
  assert.equal(r.json.conversation.threadSize, 2);
  assert.deepEqual(r.json.thread.map((s: { conversation: { id: string } }) => s.conversation.id), [a.id]);
  assert.equal(r.json.thread[0].messages[0].content, "primeira");
  assert.equal(r.json.messages[0].content, "segunda");

  const list = await call(listRoute, { headers: as("an-fabio", "analyst") });
  assert.equal(list.json.filter((i: { employeeId: string }) => i.employeeId === "emp-bruno").length, 1);
});
