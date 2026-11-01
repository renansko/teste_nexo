import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MONDAY_10H, useTempDb } from "@/test/helpers";
import { closeDb } from "@/lib/db";
import * as tk from "./ticketService";
import { legacyGateway, withRetry } from "./legacyGateway";
import { searchArticles } from "@/services/helpCenter/helpCenterService";
import { findEmployeeByEmail } from "@/services/employees/employeeService";

beforeEach(() => useTempDb({ seed: true, now: MONDAY_10H }));

test("seed: funcionários, artigos e chamados em situações variadas", () => {
  assert.equal(findEmployeeByEmail("ANA.SOUZA@nexo.com")?.id, "emp-ana");
  assert.equal(searchArticles("vpn erro 809")[0]?.article.id, "kb-vpn-809");
  const ana = tk.listTickets({ requesterId: "emp-ana" }).map((t) => tk.toView(t, MONDAY_10H));
  assert.equal(ana.find((t) => t.id === "INC-20311")?.overdue, true); // 6 dias sem atualização, prazo 3 dias úteis
  assert.equal(ana.find((t) => t.id === "REQ-10442")?.overdue, false);
  assert.equal(ana.find((t) => t.id === "INC-20150")?.status, "resolvido");
});

test("criar chamado: id sequencial, prazo pela prioridade; atualização renova o prazo", () => {
  const t = tk.createTicket(
    { type: "INC", title: "Teclado não funciona", description: "parou", category: "Hardware", priority: "alta", requesterId: "emp-ana", affected: "Só eu" },
    MONDAY_10H,
  );
  assert.equal(t.id, "INC-20400");
  assert.equal(t.dueAt, "2026-03-02T17:00:00.000Z");
  const later = new Date(MONDAY_10H.getTime() + 2 * 3_600_000);
  const u = tk.addTicketUpdate(t.id, { authorId: "emp-ana", authorRole: "employee", text: "Testei em outra porta USB" }, later);
  assert.equal(u.dueAt, "2026-03-02T19:00:00.000Z");
  assert.equal(tk.listUpdates(t.id).length, 1);
  assert.equal(tk.createTicket({ ...t, type: "REQ" }, MONDAY_10H).id, "REQ-10500");
});

test("reabertura só até 7 dias após resolvido", () => {
  const r = tk.reopenTicket("INC-20150", { authorId: "emp-ana", text: "bloqueou de novo" }, MONDAY_10H);
  assert.equal(r.status, "aberto");
  assert.equal(r.resolvedAt, null);
  assert.throws(() => tk.reopenTicket("REQ-10398", { authorId: "emp-bruno", text: "x" }, MONDAY_10H), { code: "REOPEN_NOT_ALLOWED" });
});

test("privacidade: chamado de outro funcionário não existe para quem pergunta", () => {
  assert.equal(tk.getTicketForRequester("INC-20311", "emp-ana")?.id, "INC-20311");
  assert.equal(tk.getTicketForRequester("inc-20311", "emp-bruno"), undefined);
});

test("sistema legado indisponível por uma janela; retry recupera", async () => {
  let clock = 0;
  const rolls = [0.01, 0.9, 0.9, 0.9];
  legacyGateway.configure({ rate: 0.05, durationMs: 1000, now: () => clock, random: () => rolls.shift() ?? 0.9 });
  assert.throws(() => tk.getTicket("INC-20311"), { code: "TICKET_SERVICE_UNAVAILABLE" });
  clock = 500;
  assert.throws(() => tk.getTicket("INC-20311"), { code: "TICKET_SERVICE_UNAVAILABLE" });
  clock = 0;
  let calls = 0;
  legacyGateway.configure({ rate: 0.05, durationMs: 1000, now: () => clock, random: () => (calls++ === 0 ? 0.01 : 0.9) });
  const retries: number[] = [];
  const { result, attempts } = await withRetry(() => tk.getTicket("INC-20311"), {
    delaysMs: [600, 600], sleep: async (ms) => { clock += ms; }, onRetry: (a) => retries.push(a),
  });
  assert.equal(result?.id, "INC-20311");
  assert.equal(attempts, 3);
  assert.deepEqual(retries, [1, 2]);
});

test("estado sobrevive a reinício", () => {
  const t = tk.createTicket({ type: "REQ", title: "Monitor", description: "d", category: "Hardware", priority: "baixa", requesterId: "emp-ana", affected: "Só eu" });
  closeDb();
  assert.equal(tk.getTicket(t.id)?.title, "Monitor");
});
