import { test } from "node:test";
import assert from "node:assert/strict";
import { clearTyping, markTyping, typingState, TYPING_TTL_MS } from "./presence";

test("digitando expira pelo TTL, é por papel e por conversa, e enviar limpa", () => {
  const t0 = 1_000_000;
  markTyping("c1", "employee", t0);
  assert.deepEqual(typingState("c1", t0 + 1), { employee: true, analyst: false });
  assert.deepEqual(typingState("c2", t0 + 1), { employee: false, analyst: false });
  assert.equal(typingState("c1", t0 + TYPING_TTL_MS - 1).employee, true);
  assert.equal(typingState("c1", t0 + TYPING_TTL_MS).employee, false);

  markTyping("c1", "analyst", t0);
  markTyping("c1", "analyst", t0 + 2000); // reenvio renova a janela
  assert.equal(typingState("c1", t0 + TYPING_TTL_MS + 1000).analyst, true);
  clearTyping("c1", "analyst");
  assert.equal(typingState("c1", t0 + 2001).analyst, false);
});
