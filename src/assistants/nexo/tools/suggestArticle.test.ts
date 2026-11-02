/**
 * Sugestão da central de ponta a ponta pelo orquestrador: suggest-help-article (human-in-the-loop) mostra o card,
 * pergunta "isso resolveu?" com a run suspensa, grava o feedback e, se não resolveu, o agent segue para o chamado
 * na mesma run (segunda suspensão); o chamado criado fica vinculado ao feedback.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { scriptedRunner } from "@/test/scriptedRunner";
import { getEmployee } from "@/services/employees/employeeService";
import { createConversation, getConversation } from "@/services/conversations/conversationService";
import { listFeedbackForConversation } from "@/services/helpCenter/feedbackService";
import { closeDb } from "@/lib/db";
import { runTurn } from "@/engine/conversation/turn";
import type { ChatEvent } from "@/engine/conversation/events";
import type { TurnInput } from "@/engine/types";
import { interpretFeedback } from "./helpCenter";

const ana = () => getEmployee("emp-ana")!;
beforeEach(() => useTempDb({ seed: true }));

const SUGGEST = { source: "article", id: "kb-wifi", problem: "Wi-Fi NEXO-CORP não conecta no notebook", note: "Pelo que você descreveu, vale conferir a rede e a senha." };

/**
 * Agent: no primeiro turno busca e sugere o artigo. Nos turnos seguintes só roda ao retomar a run (a tool já foi
 * reexecutada com a resposta): resolveu → agradece; não resolveu → abre o chamado; outra entrada → responde o rascunho.
 */
function agent(suggest: Record<string, unknown> = SUGGEST) {
  return scriptedRunner(async (p, tool) => {
    if (p.resume) {
      const answer = p.resume.data as TurnInput;
      if (answer.optionId === "nao-resolveu" || /continua/.test(answer.text ?? "")) {
        await tool("open-ticket", { title: "Wi-Fi corporativo não conecta", description: "Notebook não entra na NEXO-CORP; já conferi a rede e redefini a senha.", type: "INC", category: "Rede e VPN" });
        return "Vou abrir um chamado para isso.";
      }
      await tool("report-decision", { understanding: "wi-fi", action: "respondi", confidence: "alta", reasoning: "feedback do funcionário" });
      return answer.optionId === "resolveu" ? "Que bom que resolveu! Qualquer coisa, é só chamar." : "Certo, aqui está o rascunho.";
    }
    await tool("search-help-center", { query: "wifi não conecta" });
    await tool("suggest-help-article", suggest);
    return "Encontrei um procedimento que deve resolver.";
  });
}
const start = (conversationId: string, emit?: (e: ChatEvent) => void, suggest?: Record<string, unknown>) =>
  runTurn({ conversationId, user: ana(), input: { text: "meu wifi não conecta" }, runner: agent(suggest), emit });
const send = (conversationId: string, input: TurnInput) => runTurn({ conversationId, user: ana(), input, runner: agent() });
const part = (m: { payload: { kind: string; data: unknown }[] | null }, kind: string) => m.payload!.find((p) => p.kind === kind)?.data;
const optionIds = (m: { payload: { kind: string; data: unknown }[] | null }) => (part(m, "options") as { id: string }[]).map((o) => o.id);

test("sugere o artigo com a run suspensa; 'não resolveu' grava o feedback e segue para o chamado na mesma run; o chamado fica vinculado", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const events: ChatEvent[] = [];
  const r1 = await start(conv.id, (e) => events.push(e));
  const m1 = r1.messages[0]!;
  // Como no Mastra, a run termina na suspensão: a mensagem é a pergunta da tool (nota + "isso resolveu?").
  assert.equal(m1.content, "Pelo que você descreveu, vale conferir a rede e a senha.\n\nSiga os passos acima e me diga: isso resolveu?");
  assert.deepEqual((part(m1, "articles") as { id: string; source: string }[]).map((a) => [a.id, a.source]), [["kb-wifi", "article"]]);
  assert.deepEqual(optionIds(m1), ["resolveu", "nao-resolveu", "falar-com-um-analista", "cancel"]);
  assert.equal(r1.conversation.suspendedRun?.toolId, "suggest-help-article");
  const labels = m1.trace!.actions.map((a) => `${a.label}:${a.status}`);
  assert.deepEqual(labels, ["buscou na central de ajuda:done", "sugeriu um artigo da central:pending"]);
  assert.match(m1.trace!.actions[1]!.summary ?? "", /perguntou: Siga os passos/);
  assert.equal(events.filter((e) => e.type === "payload").length, 2); // card + opções
  let fb = listFeedbackForConversation(conv.id);
  assert.equal(fb.length, 1);
  assert.equal(fb[0]!.outcome, "pending");
  assert.equal(fb[0]!.problem, SUGGEST.problem);

  closeDb(); // reinício com a pergunta pendente: card e feedback estão persistidos

  const r2 = await send(conv.id, { optionId: "nao-resolveu" });
  fb = listFeedbackForConversation(conv.id);
  assert.equal(fb[0]!.outcome, "not_resolved");
  assert.equal(fb[0]!.employeeText, "Não resolveu"); // rótulo do botão
  assert.ok(fb[0]!.answeredAt);
  assert.match(r2.messages[0]!.content, /Quantas pessoas isso afeta\?/); // open-ticket já perguntando, na mesma run
  assert.equal(r2.conversation.suspendedRun?.toolId, "open-ticket");
  assert.deepEqual(r2.messages[0]!.trace!.actions.map((a) => `${a.label}:${a.status}`), ["sugeriu um artigo da central:done", "montou o chamado:pending"]);
  assert.equal(r2.messages[0]!.trace!.actions[0]!.summary, "Wi-Fi corporativo NEXO-CORP: not_resolved");

  const r3 = await send(conv.id, { optionId: "eu" });
  assert.match(r3.messages[0]!.content, /urgência/);
  const r4 = await send(conv.id, { text: "Parou, não consigo trabalhar" });
  assert.equal(r4.messages[0]!.content, "Certo, aqui está o rascunho.");
  assert.ok(r4.conversation.pendingAction);
  const r5 = await send(conv.id, { optionId: "confirm" });
  assert.match(r5.messages[0]!.content, /Chamado INC-20400 criado/);
  assert.equal(listFeedbackForConversation(conv.id)[0]!.ticketId, "INC-20400");
});

test("'resolveu' fecha o feedback como resolvido e a conversa segue sem chamado", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  await start(conv.id);
  const r2 = await send(conv.id, { optionId: "resolveu" });
  assert.equal(r2.messages[0]!.content, "Que bom que resolveu! Qualquer coisa, é só chamar.");
  assert.equal(r2.conversation.suspendedRun, null);
  assert.equal(r2.conversation.ticketId, null);
  assert.equal(r2.messages[0]!.trace!.decision?.confidence, "alta");
  const fb = listFeedbackForConversation(conv.id)[0]!;
  assert.equal(fb.outcome, "resolved");
  assert.equal(fb.ticketId, null);
});

test("texto livre: caso claro vira not_resolved; ambíguo fica unclear com o texto guardado", async () => {
  const c1 = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  await start(c1.id);
  const r = await send(c1.id, { text: "não funcionou, continua igual" });
  assert.equal(listFeedbackForConversation(c1.id)[0]!.outcome, "not_resolved");
  assert.match(r.messages[0]!.content, /Quantas pessoas/);

  const c2 = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  await start(c2.id);
  await send(c2.id, { text: "agora aparece outra tela pedindo certificado" });
  const fb = listFeedbackForConversation(c2.id)[0]!;
  assert.equal(fb.outcome, "unclear");
  assert.equal(fb.employeeText, "agora aparece outra tela pedindo certificado");
});

test("cancelar descarta a pergunta sem reexecutar a tool: o feedback fica pendente (sem resposta)", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  await start(conv.id);
  const r = await send(conv.id, { optionId: "cancel" });
  assert.equal(r.messages[0]!.trace!.source, "rule");
  assert.match(r.messages[0]!.content, /deixo isso de lado/);
  assert.equal(getConversation(conv.id)!.suspendedRun, null);
  assert.equal(listFeedbackForConversation(conv.id)[0]!.outcome, "pending");
});

test("id inexistente: erro vai ao modelo como resultado, nada é gravado", async () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const r = await start(conv.id, undefined, { source: "article", id: "kb-nao-existe", problem: "qualquer coisa" });
  assert.equal(r.conversation.suspendedRun, null);
  const action = r.messages[0]!.trace!.actions.find((a) => a.tool === "suggest-help-article")!;
  assert.equal(action.status, "error");
  assert.deepEqual(r.messages[0]!.trace!.notes, ["suggest-help-article: KNOWLEDGE_NOT_FOUND"]);
  assert.equal(listFeedbackForConversation(conv.id).length, 0);
});

test("interpretFeedback: botões são inequívocos; texto só nos casos claros", () => {
  assert.equal(interpretFeedback({ optionId: "resolveu", text: "Resolveu" }), "resolved");
  assert.equal(interpretFeedback({ optionId: "nao-resolveu" }), "not_resolved");
  assert.equal(interpretFeedback({ optionId: "falar-com-um-analista" }), "analyst");
  assert.equal(interpretFeedback({ text: "Deu certo, obrigada!" }), "resolved");
  assert.equal(interpretFeedback({ text: "sim" }), "resolved");
  assert.equal(interpretFeedback({ text: "Não resolveu" }), "not_resolved");
  assert.equal(interpretFeedback({ text: "ainda dá o mesmo erro" }), "not_resolved");
  assert.equal(interpretFeedback({ text: "prefiro falar com um analista" }), "analyst");
  assert.equal(interpretFeedback({ text: "tentei mas apareceu outra mensagem" }), "unclear");
  assert.equal(interpretFeedback({}), "unclear");
});
