import { test } from "node:test";
import assert from "node:assert/strict";
import { addBusinessDays, addBusinessHours, computeDueAt, isPastDue } from "./sla";

// Brasília = UTC-3. Segunda 2026-03-02 10:00 local = 13:00Z.
const monday10 = new Date("2026-03-02T13:00:00.000Z");
const friday16 = new Date("2026-03-06T19:00:00.000Z");
const saturday = new Date("2026-03-07T15:00:00.000Z");

test("4h úteis dentro do expediente", () => {
  assert.equal(addBusinessHours(monday10, 4).toISOString(), "2026-03-02T17:00:00.000Z"); // 14:00 local
});

test("4h úteis atravessam o fim do expediente", () => {
  assert.equal(addBusinessHours(friday16, 4).toISOString(), "2026-03-09T13:00:00.000Z"); // seg 10:00 local
});

test("hora útil a partir do fim de semana começa na segunda 08:00", () => {
  assert.equal(addBusinessHours(saturday, 1).toISOString(), "2026-03-09T12:00:00.000Z"); // seg 09:00 local
});

test("dias úteis pulam fim de semana", () => {
  assert.equal(addBusinessDays(friday16, 3).toISOString(), "2026-03-11T19:00:00.000Z"); // quarta 16:00 local
});

test("prazos por prioridade", () => {
  assert.equal(computeDueAt("critica", saturday).getTime(), saturday.getTime() + 3_600_000);
  assert.equal(computeDueAt("alta", monday10).toISOString(), "2026-03-02T17:00:00.000Z");
  assert.equal(computeDueAt("media", monday10).toISOString(), "2026-03-05T13:00:00.000Z");
  assert.equal(computeDueAt("baixa", monday10).toISOString(), "2026-03-09T13:00:00.000Z");
});

test("vencido", () => {
  assert.equal(isPastDue("2026-03-02T12:00:00.000Z", monday10), true);
  assert.equal(isPastDue("2026-03-02T14:00:00.000Z", monday10), false);
});
