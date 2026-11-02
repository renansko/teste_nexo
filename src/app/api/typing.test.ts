/** Presença "digitando" entre funcionário e analista pelas rotas HTTP. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { as, call } from "@/test/api";
import { getEmployee } from "@/services/employees/employeeService";
import { createConversation } from "@/services/conversations/conversationService";
import { analystReply, takeConversation } from "@/engine/conversation/state";
import { POST as employeeTyping } from "./conversations/[id]/typing/route";
import { GET as employeePoll } from "./conversations/[id]/messages/route";
import { POST as analystTyping } from "./analyst/conversations/[id]/typing/route";
import { GET as detail } from "./analyst/conversations/[id]/route";

beforeEach(() => useTempDb({ seed: true }));

const ana = () => as("emp-ana");
const fabio = () => as("an-fabio", "analyst");

test("digitando: funcionário aparece no console, analista aparece no polling do funcionário, responder limpa", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const p = { id: conv.id };

  // Analista só avisa depois de assumir.
  assert.equal((await call(analystTyping, { headers: fabio(), params: p, body: {} })).json.error, "NOT_ASSIGNED");
  takeConversation(conv.id, getEmployee("an-fabio")!);

  assert.equal((await call(employeeTyping, { headers: ana(), params: p, body: {} })).status, 200);
  assert.equal((await call(detail, { headers: fabio(), params: p })).json.typing.employee, true);

  assert.equal((await call(analystTyping, { headers: fabio(), params: p, body: {} })).status, 200);
  const poll = () => call(employeePoll, { headers: ana(), params: p, url: "http://x/api?after=0" });
  assert.equal((await poll()).json.typing.analyst, true);

  analystReply(conv.id, getEmployee("an-fabio")!, "Oi, Ana, já estou vendo.");
  assert.equal((await poll()).json.typing.analyst, false);

  // Privacidade: outro funcionário não marca nem lê conversa alheia; outro analista não marca sem assumir.
  assert.equal((await call(employeeTyping, { headers: as("emp-bruno"), params: p, body: {} })).status, 404);
  assert.equal((await call(analystTyping, { headers: as("an-gabriela", "analyst"), params: p, body: {} })).status, 409);
});
