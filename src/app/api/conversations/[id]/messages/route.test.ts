import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { as, call } from "@/test/api";
import { scriptedRunner } from "@/test/scriptedRunner";
import { setDefaultRunner } from "@/engine/conversation/turn";
import { createConversation } from "@/services/conversations/conversationService";
import { GET, POST } from "./route";

beforeEach(() => {
  useTempDb({ seed: true });
  setDefaultRunner(scriptedRunner(async (_p, tool) => {
    await tool("search-help-center", { query: "vpn erro 809" });
    await tool("cite-articles", { ids: ["kb-vpn-809"] });
    await tool("report-decision", { understanding: "VPN", action: "respondi com artigo", confidence: "alta", reasoning: "artigo kb-vpn-809" });
    return "Reinstale o cliente de VPN pelo portal e reinicie.";
  }));
});
afterEach(() => setDefaultRunner(undefined));

test("POST em JSON devolve mensagens produzidas e conversa", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const r = await call(POST, { headers: as("emp-ana"), params: { id: conv.id }, body: { text: "vpn com erro 809" } });
  assert.equal(r.status, 200);
  assert.equal(r.json.messages.length, 1);
  assert.equal(r.json.messages[0].payload[0].kind, "articles");
  assert.equal(r.json.messages[0].trace.actions[0].label, "buscou na central de ajuda");
  assert.equal(r.json.conversation.userMessages, 1);

  const after = await call(GET, { headers: as("emp-ana"), params: { id: conv.id }, url: "http://x/api?after=0" });
  assert.deepEqual(after.json.messages.map((m: { role: string }) => m.role), ["user", "agent"]);
  // Polling ocioso: mesmo estado → 304 sem corpo; mensagem nova → 200 com outro ETag.
  const etag = after.res.headers.get("etag")!;
  assert.match(etag, /^W\/"/);
  const idle = await call(GET, { headers: { ...as("emp-ana"), "if-none-match": etag }, params: { id: conv.id }, url: "http://x/api?after=2" });
  assert.equal(idle.status, 304);
  assert.equal(idle.json, null);
  await call(POST, { headers: as("emp-ana"), params: { id: conv.id }, body: { text: "e o erro 809 continua" } });
  const changed = await call(GET, { headers: { ...as("emp-ana"), "if-none-match": etag }, params: { id: conv.id }, url: "http://x/api?after=2" });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.res.headers.get("etag"), etag);
  assert.deepEqual(changed.json.messages.map((m: { role: string }) => m.role), ["user", "agent"]);
  assert.equal((await call(POST, { headers: as("an-fabio", "analyst"), params: { id: conv.id }, body: { text: "x" } })).status, 403);
  assert.equal((await call(POST, { headers: as("emp-ana"), params: { id: conv.id }, body: {} })).status, 400);
});

test("POST com Accept: text/event-stream devolve SSE com ações, texto, payload, trace e fim", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const r = await call(POST, { headers: { ...as("emp-ana"), accept: "text/event-stream" }, params: { id: conv.id }, body: { text: "vpn com erro 809" } });
  assert.equal(r.status, 200);
  assert.match(r.res.headers.get("content-type") ?? "", /text\/event-stream/);
  const events = String(r.json).trim().split("\n\n").map((block) => {
    const [ev, data] = block.split("\n");
    return { type: ev!.replace("event: ", ""), data: JSON.parse(data!.replace("data: ", "")) };
  });
  // dois payloads: artigos e a opção "Abrir um chamado" que a central sempre oferece
  assert.deepEqual(events.map((e) => e.type), ["message.start", "action", "action", "text.delta", "payload", "payload", "trace", "message.end", "conversation"]);
  assert.equal(events[1]!.data.action.label, "buscou na central de ajuda");
  assert.equal(events[3]!.data.delta, "Reinstale o cliente de VPN pelo portal e reinicie.");
  assert.equal(events[4]!.data.part.kind, "articles");
  assert.deepEqual(events[5]!.data.part, { kind: "options", data: [{ id: "abrir-um-chamado", label: "Abrir um chamado" }] });
  assert.equal(events[7]!.data.message.role, "agent");
});

test("erro de domínio no SSE vira evento error", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const { updateConversation } = await import("@/services/conversations/conversationService");
  updateConversation(conv.id, { state: "closed" });
  const r = await call(POST, { headers: { ...as("emp-ana"), accept: "text/event-stream" }, params: { id: conv.id }, body: { text: "oi" } });
  assert.match(String(r.json), /event: error\ndata: \{"code":"CONVERSATION_CLOSED"/);
  const j = await call(POST, { headers: as("emp-ana"), params: { id: conv.id }, body: { text: "oi" } });
  assert.equal(j.status, 409);
});

test("texto sem conteúdo útil responde por regra no SSE (sem ação, sem modelo) e a conversa expõe inputPolicy", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const r = await call(POST, { headers: { ...as("emp-ana"), accept: "text/event-stream" }, params: { id: conv.id }, body: { text: "???" } });
  const events = String(r.json).trim().split("\n\n").map((block) => {
    const [ev, data] = block.split("\n");
    return { type: ev!.replace("event: ", ""), data: JSON.parse(data!.replace("data: ", "")) };
  });
  assert.deepEqual(events.map((e) => e.type), ["message.start", "payload", "trace", "message.end", "conversation"]);
  assert.equal(events[2]!.data.trace.source, "rule");
  assert.equal(events[4]!.data.conversation.inputPolicy.minChars, 2);
  assert.equal(events[4]!.data.conversation.inputPolicy.allowDigitsOnly, false);
  assert.ok(!("options" in events[4]!.data.conversation.inputPolicy));

  const j = await call(POST, { headers: as("emp-ana"), params: { id: conv.id }, body: { text: "x".repeat(4001) } });
  assert.equal(j.status, 400); // teto HTTP fixo
});
