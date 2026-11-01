import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { as, call } from "@/test/api";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as me } from "@/app/api/auth/me/route";
import { GET as listConvs, POST as createConv } from "@/app/api/conversations/route";
import { GET as getConv } from "@/app/api/conversations/[id]/route";
import { GET as getMessages } from "@/app/api/conversations/[id]/messages/route";
import { GET as listTickets } from "@/app/api/tickets/route";
import { GET as getTicket } from "@/app/api/tickets/[id]/route";
import { GET as helpCenter } from "@/app/api/help-center/route";
import { addMessage } from "@/services/conversations/conversationService";

beforeEach(() => useTempDb({ seed: true }));

test("login com e-mail corporativo e qualquer senha; cookie e bearer", async () => {
  const r = await call(login, { body: { email: "ana.souza@nexo.com", password: "qualquer" } });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.name, "Ana Souza");
  assert.match(r.res.headers.get("set-cookie") ?? "", /nexo_session=.*HttpOnly/);
  const m = await call(me, { headers: { cookie: `nexo_session=${encodeURIComponent(r.json.token)}` } });
  assert.equal(m.json.user.id, "emp-ana");
  const bad = await call(login, { body: { email: "ninguem@nexo.com", password: "x" } });
  assert.equal(bad.status, 401);
  assert.equal((await call(me)).status, 401);
});

test("conversas: criar, listar as minhas, ler e paginar mensagens; não vejo conversa alheia", async () => {
  const c = await call(createConv, { headers: as("emp-ana"), method: "POST" });
  assert.equal(c.status, 201);
  assert.equal(c.json.state, "agent");
  assert.equal(c.json.limit, 30);
  addMessage(c.json.id, { role: "user", content: "oi" });
  addMessage(c.json.id, { role: "analyst", content: "olá" });

  const list = await call(listConvs, { headers: as("emp-ana") });
  assert.equal(list.json.length, 1);
  assert.equal(list.json[0].lastMessage.content, "olá");
  assert.equal(list.json[0].userMessages, 1);

  const full = await call(getConv, { headers: as("emp-ana"), params: { id: c.json.id } });
  assert.equal(full.json.messages.length, 2);
  const inc = await call(getMessages, { headers: as("emp-ana"), params: { id: c.json.id }, url: "http://x/api?after=1" });
  assert.deepEqual(inc.json.messages.map((m: any) => m.content), ["olá"]);

  const other = await call(getConv, { headers: as("emp-bruno"), params: { id: c.json.id } });
  assert.equal(other.status, 404);
  const analyst = await call(getConv, { headers: as("an-fabio", "analyst"), params: { id: c.json.id } });
  assert.equal(analyst.status, 200);
});

test("chamados e central de ajuda respeitam sessão e privacidade", async () => {
  const mine = await call(listTickets, { headers: as("emp-ana"), url: "http://x/api?open=true" });
  assert.deepEqual(mine.json.map((t: any) => t.id).sort(), ["INC-20311", "REQ-10442"]);
  assert.equal(mine.json.find((t: any) => t.id === "INC-20311").overdue, true);
  const one = await call(getTicket, { headers: as("emp-ana"), params: { id: "REQ-10442" } });
  assert.equal(one.json.updates.length, 1);
  assert.equal((await call(getTicket, { headers: as("emp-bruno"), params: { id: "REQ-10442" } })).status, 404);
  const kb = await call(helpCenter, { headers: as("emp-ana"), url: "http://x/api?q=vpn%20809" });
  assert.equal(kb.json[0].id, "kb-vpn-809");
});
