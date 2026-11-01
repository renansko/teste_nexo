import { test } from "node:test";
import assert from "node:assert/strict";
import { apiKeyVarFor, assertRuntimeEnv, env, EnvError } from "./env";

test("defaults: openai/gpt-6-luna; vazio conta como ausente", () => {
  const e = env({ NEXO_MESSAGE_LIMIT: "", NEXO_MODEL: "" });
  assert.equal(e.NEXO_MODEL, "openai/gpt-6-luna");
  assert.equal(e.NEXO_FAST_MODEL, "openai/gpt-6-luna");
  assert.equal(e.NEXO_MESSAGE_LIMIT, 30);
  assert.equal(e.NEXO_DB_PATH, "./data/nexo.db");
});

test("NEXO_MODEL explícito vence e exige o formato provedor/modelo", () => {
  assert.equal(env({ NEXO_MODEL: "anthropic/claude-sonnet-5-5" }).NEXO_MODEL, "anthropic/claude-sonnet-5-5");
  assert.throws(() => env({ NEXO_MODEL: "gpt-6-luna" }), (err: Error) => err instanceof EnvError && /NEXO_MODEL/.test(err.message));
});

test("chave do provedor vem do prefixo do modelo", () => {
  assert.equal(apiKeyVarFor("openai/gpt-6-luna"), "OPENAI_API_KEY");
  assert.equal(apiKeyVarFor("anthropic/claude-sonnet-5-5"), "ANTHROPIC_API_KEY");
});

test("valores inválidos falham citando a variável, não o valor", () => {
  assert.throws(() => env({ NEXO_TICKETS_OUTAGE_RATE: "2" }), /NEXO_TICKETS_OUTAGE_RATE/);
  assert.throws(() => env({ NEXO_MESSAGE_LIMIT: "abc" }), /NEXO_MESSAGE_LIMIT/);
  assert.throws(() => env({ NEXO_AUTH_SECRET: "curto-segredo" }), (err: Error) => /NEXO_AUTH_SECRET/.test(err.message) && !err.message.includes("curto-segredo"));
});

test("runtime: exige a chave do provedor do modelo e segredo em produção", () => {
  assert.throws(() => assertRuntimeEnv({ NODE_ENV: "development" }), /OPENAI_API_KEY/);
  assert.throws(() => assertRuntimeEnv({ NODE_ENV: "development", NEXO_MODEL: "anthropic/claude-sonnet-5-5", OPENAI_API_KEY: "x" }), /ANTHROPIC_API_KEY/);
  assert.throws(() => assertRuntimeEnv({ NODE_ENV: "production", OPENAI_API_KEY: "x" }), /NEXO_AUTH_SECRET/);
  assert.doesNotThrow(() => assertRuntimeEnv({ NODE_ENV: "production", OPENAI_API_KEY: "x", NEXO_AUTH_SECRET: "0123456789abcdef" }));
  assert.doesNotThrow(() => assertRuntimeEnv({ NODE_ENV: "test" }));
});
