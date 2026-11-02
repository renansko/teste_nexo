/** Analista resolve um chamado (solução vira memória) e consulta as métricas da central. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { as, call } from "@/test/api";
import { createConversation } from "@/services/conversations/conversationService";
import { answerFeedback, linkTicket, openFeedback } from "@/services/helpCenter/feedbackService";
import { listResolutions, searchKnowledge } from "@/services/helpCenter/helpCenterService";
import { getTicket, listUpdates } from "@/services/tickets/ticketService";
import { POST as resolve } from "./tickets/[id]/resolve/route";
import { GET as metrics } from "./help-center/metrics/route";

const fabio = () => as("an-fabio", "analyst");
beforeEach(() => useTempDb({ seed: true }));

test("resolver: só analista; chamado precisa estar vivo; solução vira atualização, status e memória com o que foi tentado", async () => {
  assert.equal((await call(resolve, { headers: as("emp-ana"), params: { id: "INC-20311" }, body: { solution: "Driver de vídeo atualizado e índice reconstruído." } })).status, 403);
  assert.equal((await call(resolve, { headers: fabio(), params: { id: "INC-99999" }, body: { solution: "Driver de vídeo atualizado e índice reconstruído." } })).status, 404);
  assert.equal((await call(resolve, { headers: fabio(), params: { id: "INC-20150" }, body: { solution: "Já estava resolvido, só conferindo." } })).json.error, "TICKET_NOT_OPEN");
  assert.equal((await call(resolve, { headers: fabio(), params: { id: "INC-20311" }, body: { solution: "curto" } })).status, 400);

  // Antes do chamado, o agent sugeriu um artigo que não resolveu nesta conversa.
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const fb = openFeedback({ conversationId: conv.id, employeeId: "emp-ana", source: "article", sourceId: "kb-portal-softwares", problem: "notebook lento" });
  answerFeedback(fb, "not_resolved", "Não resolveu");
  linkTicket(conv.id, "INC-20311");

  const r = await call(resolve, { headers: fabio(), params: { id: "inc-20311" }, body: { solution: "Driver de vídeo atualizado e índice de busca do Windows reconstruído." } });
  assert.equal(r.status, 200);
  assert.equal(r.json.ticket.status, "resolvido");
  assert.ok(r.json.ticket.resolvedAt);
  assert.equal(getTicket("INC-20311")!.status, "resolvido");
  assert.equal(listUpdates("INC-20311").at(-1)!.text, "Resolvido: Driver de vídeo atualizado e índice de busca do Windows reconstruído.");
  const memory = listResolutions().find((m) => m.ticketId === "INC-20311")!;
  assert.equal(memory.id, r.json.memoryId);
  assert.deepEqual(memory.triedArticleIds, ["article:kb-portal-softwares"]);
  assert.equal(memory.resolvedBy, "an-fabio");
  // O agent passa a encontrar a solução na central, sem dados do chamado.
  const hit = searchKnowledge("notebook lento depois da atualização", 3).find((h) => h.source === "resolution")!;
  assert.equal(hit.id, memory.id);
  assert.match(hit.body, /Driver de vídeo/);
  assert.doesNotMatch(JSON.stringify(hit), /INC-20311|emp-ana|Excel/);
});

test("métricas: só analista; agregados por artigo com título", async () => {
  assert.equal((await call(metrics, { headers: as("emp-ana") })).status, 403);
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  answerFeedback(openFeedback({ conversationId: conv.id, employeeId: "emp-ana", source: "article", sourceId: "kb-vpn-809", problem: "vpn 809" }), "resolved", "Resolveu");
  openFeedback({ conversationId: conv.id, employeeId: "emp-ana", source: "article", sourceId: "kb-vpn-809", problem: "vpn 809 de novo" });
  const r = await call(metrics, { headers: fabio() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, [{ source: "article", sourceId: "kb-vpn-809", title: "VPN com erro 809", shown: 2, resolved: 1, notResolved: 0, analyst: 0, unclear: 0, pending: 1, resolutionRate: 1 }]);
});
