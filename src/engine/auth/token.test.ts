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

test("em produção, sem NEXO_AUTH_SECRET, recusa assinar e verificar (segredo de dev não vale)", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { node: env.NODE_ENV, secret: env.NEXO_AUTH_SECRET };
  const forged = signSession({ sub: "an-fabio", role: "analyst" }); // assinado com o segredo de dev
  try {
    env.NODE_ENV = "production";
    delete env.NEXO_AUTH_SECRET;
    assert.throws(() => signSession({ sub: "emp-ana", role: "employee" }), { code: "AUTH_NOT_CONFIGURED" });
    assert.throws(() => verifySession(forged), { code: "AUTH_NOT_CONFIGURED" });
    env.NEXO_AUTH_SECRET = "segredo-de-producao";
    assert.equal(verifySession(forged), null);
  } finally {
    if (saved.node === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = saved.node;
    if (saved.secret === undefined) delete env.NEXO_AUTH_SECRET;
    else env.NEXO_AUTH_SECRET = saved.secret;
  }
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
