import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { requireSession, resolveSession, sessionCookie, signSession, verifySession } from "./token";

beforeEach(() => useTempDb({ seed: true }));

test("assina, verifica e expira", () => {
  const now = new Date("2026-03-02T13:00:00Z");
  const token = signSession({ sub: "emp-ana", role: "employee" }, now);
  assert.equal(verifySession(token, now)?.sub, "emp-ana");
  assert.equal(verifySession(token, new Date(now.getTime() + 8 * 86_400_000)), null);
  assert.equal(verifySession(token.slice(0, -2) + "zz", now), null);
  assert.equal(verifySession("lixo", now), null);
});

test("resolve sessão por Bearer e por cookie; exige role", () => {
  const token = signSession({ sub: "emp-ana", role: "employee" });
  const bearer = new Request("http://x/api", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(resolveSession(bearer)?.user.name, "Ana Souza");
  const cookie = new Request("http://x/api", { headers: { cookie: `a=b; ${sessionCookie(token).split(";")[0]}` } });
  assert.equal(resolveSession(cookie)?.user.id, "emp-ana");
  assert.throws(() => requireSession(new Request("http://x/api")), { code: "UNAUTHENTICATED" });
  assert.throws(() => requireSession(bearer, { role: "analyst" }), { code: "FORBIDDEN" });
  const analyst = signSession({ sub: "an-fabio", role: "analyst" });
  assert.equal(requireSession(new Request("http://x/api", { headers: { authorization: `Bearer ${analyst}` } }), { role: "analyst" }).user.role, "analyst");
});
