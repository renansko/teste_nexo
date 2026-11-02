/** Busca unificada (artigos + memória de resolução), privacidade da memória e métricas de feedback. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { createConversation } from "@/services/conversations/conversationService";
import { getResolution, listResolutions, rememberResolution, searchKnowledge } from "./helpCenterService";
import { answerFeedback, feedbackMetrics, linkTicket, listFeedbackForConversation, openFeedback, triedSourcesForTicket } from "./feedbackService";

beforeEach(() => useTempDb({ seed: true }));

test("searchKnowledge mistura artigo e solução de caso resolvido; a memória nunca expõe chamado nem solicitante", () => {
  const hits = searchKnowledge("senha do SAP bloqueada", 5);
  assert.deepEqual([...new Set(hits.map((h) => h.source))].sort(), ["article", "resolution"]);
  assert.equal(hits[0]!.id, "kb-sap-senha"); // o artigo com o título igual pontua mais que a memória
  const memory = hits.find((h) => h.source === "resolution")!;
  assert.equal(memory.title, "Senha do SAP bloqueada");
  assert.match(memory.body, /senha temporária/);
  assert.deepEqual(Object.keys(memory).sort(), ["body", "category", "id", "score", "source", "title"]);
  assert.doesNotMatch(JSON.stringify(memory), /INC-20150|ASOUZA|emp-ana/);
  assert.equal(searchKnowledge("", 5).length, 0);
});

test("rememberResolution é uma por chamado: resolver de novo substitui a solução", () => {
  const base = { ticketId: "INC-20311", type: "INC", category: "Hardware", title: "Notebook lento após atualização do Windows", triedArticleIds: [], resolvedBy: "an-fabio", resolvedAt: "2026-11-01T12:00:00.000Z" };
  const a = rememberResolution({ ...base, solution: "Removido o driver antigo de vídeo e aplicada a atualização cumulativa." });
  const b = rememberResolution({ ...base, solution: "Driver de vídeo atualizado e índice de busca reconstruído.", triedArticleIds: ["article:kb-portal-softwares"] });
  assert.equal(a.id, b.id);
  assert.equal(getResolution(a.id)!.solution, "Driver de vídeo atualizado e índice de busca reconstruído.");
  assert.deepEqual(getResolution(a.id)!.triedArticleIds, ["article:kb-portal-softwares"]);
  assert.equal(listResolutions().filter((m) => m.ticketId === "INC-20311").length, 1);
});

test("feedback: abrir, responder, vincular chamado, fontes tentadas e métricas por artigo", () => {
  const c1 = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const c2 = createConversation({ assistantId: "nexo", employeeId: "emp-bruno" });
  const f1 = openFeedback({ conversationId: c1.id, employeeId: "emp-ana", source: "article", sourceId: "kb-wifi", problem: "wifi não conecta" });
  const f2 = openFeedback({ conversationId: c1.id, employeeId: "emp-ana", source: "article", sourceId: "kb-senha-rede", problem: "senha" });
  const f3 = openFeedback({ conversationId: c2.id, employeeId: "emp-bruno", source: "article", sourceId: "kb-wifi", problem: "sem internet" });
  openFeedback({ conversationId: c2.id, employeeId: "emp-bruno", source: "resolution", sourceId: "mem-1", problem: "sap" });
  answerFeedback(f1, "not_resolved", "Não resolveu");
  answerFeedback(f2, "resolved", "Resolveu");
  answerFeedback(f3, "resolved", "deu certo");

  assert.equal(linkTicket(c1.id, "INC-20311"), 2);
  assert.equal(linkTicket(c1.id, "INC-20999"), 0); // já vinculadas: não sobrescreve
  assert.deepEqual(listFeedbackForConversation(c1.id).map((f) => f.ticketId), ["INC-20311", "INC-20311"]);
  // Só o que não resolveu conta como "tentado e falhou" para a memória.
  assert.deepEqual(triedSourcesForTicket("INC-20311"), [{ source: "article", id: "kb-wifi" }]);

  const metrics = feedbackMetrics();
  const wifi = metrics.find((m) => m.sourceId === "kb-wifi")!;
  assert.equal(metrics[0]!.sourceId, "kb-wifi"); // mais sugerido primeiro
  assert.deepEqual({ shown: wifi.shown, resolved: wifi.resolved, notResolved: wifi.notResolved, pending: wifi.pending, rate: wifi.resolutionRate }, { shown: 2, resolved: 1, notResolved: 1, pending: 0, rate: 0.5 });
  const mem = metrics.find((m) => m.source === "resolution")!;
  assert.deepEqual({ shown: mem.shown, pending: mem.pending, rate: mem.resolutionRate }, { shown: 1, pending: 1, rate: null });
});
