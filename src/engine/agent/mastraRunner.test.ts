/** Verifica a integração com o Mastra usando um modelo simulado (sem rede). */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MastraLanguageModelV2Mock, simulateReadableStream } from "@mastra/core/test-utils/llm-mock";
import { RequestContext } from "@mastra/core/request-context";
import { useTempDb } from "@/test/helpers";
import { nexoAssistant } from "@/assistants/nexo/persona";
import { createConversation } from "@/services/conversations/conversationService";
import { newCollector, wrapTools } from "@/engine/tools/wrap";
import { createMastraRunner } from "./mastraRunner";
import { resetMastra } from "./mastra";
import type { AgentRunParams } from "./types";
import type { SuspendPrompt, TurnContext } from "@/engine/types";

beforeEach(() => useTempDb({ seed: true }));

const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
const step = (chunks: unknown[]) => ({ stream: simulateReadableStream({ chunks: chunks as never[] }) });
const textStep = (text: string) => step([
  { type: "stream-start", warnings: [] },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: text },
  { type: "text-end", id: "t1" },
  { type: "finish", finishReason: "stop", usage },
]);
const toolCallStep = (toolName: string, input: unknown, toolCallId = "c1") => step([
  { type: "stream-start", warnings: [] },
  { type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) },
  { type: "finish", finishReason: "tool-calls", usage },
]);

function requestContext(conversationId = "c") {
  const rc = new RequestContext<TurnContext>();
  rc.set("userId", "emp-ana");
  rc.set("conversationId", conversationId);
  rc.set("assistantId", "nexo");
  rc.set("now", new Date().toISOString());
  return rc;
}

test("agent Mastra chama tool embrulhada com requestContext e devolve texto", async () => {
  const model = new MastraLanguageModelV2Mock({ doStream: [toolCallStep("list-my-tickets", { status: "open" }), textStep("Você tem 2 chamados abertos.")] as never });

  const collector = newCollector();
  const tools = wrapTools(nexoAssistant, collector, () => {}, { hasPendingAction: false });
  const deltas: string[] = [];
  const runner = createMastraRunner({ model: () => model as never });
  const result = await runner({
    config: nexoAssistant, tools, requestContext: requestContext(), system: "ctx",
    messages: [{ role: "user", content: "como estão meus chamados?" }],
    onTextDelta: (d) => deltas.push(d),
  });

  assert.equal(result.text, "Você tem 2 chamados abertos.");
  assert.deepEqual(deltas, ["Você tem 2 chamados abertos."]);
  assert.equal(collector.actions.length, 1);
  assert.equal(collector.actions[0]!.label, "consultou seus chamados");
  assert.equal(collector.actions[0]!.status, "done");
  assert.equal(collector.payload[0]!.kind, "tickets");
  assert.ok((result.usage?.inputTokens ?? 0) > 0);
});

test("human-in-the-loop: open-ticket suspende a run, a resposta retoma em outro Agent (storage em arquivo) até o rascunho", async () => {
  // O modelo é chamado duas vezes: ao abrir (tool call) e depois que a tool conclui o rascunho (texto final).
  const model = new MastraLanguageModelV2Mock({
    doStream: [
      toolCallStep("open-ticket", { title: "Teclado do notebook parou de funcionar", description: "Nenhuma tecla responde desde cedo.", type: "INC", category: "Hardware" }),
      textStep("Aqui está o rascunho. Posso criar?"),
    ] as never,
  });
  const runner = createMastraRunner({ model: () => model as never });
  const run = (extra: Partial<AgentRunParams>) => {
    const collector = newCollector();
    const tools = wrapTools(nexoAssistant, collector, () => {}, { hasPendingAction: false });
    return runner({ config: nexoAssistant, tools, requestContext: requestContext(), system: "ctx", messages: [], onTextDelta: () => {}, ...extra })
      .then((result) => ({ result, collector }));
  };

  const first = await run({ messages: [{ role: "user", content: "meu teclado parou" }] });
  assert.equal(first.result.finishReason, "suspended");
  assert.ok(first.result.suspended?.runId);
  assert.equal(first.result.suspended?.toolId, "open-ticket");
  assert.equal(first.collector.suspended?.toolId, "open-ticket");
  const q1 = first.collector.suspended!.prompt;
  assert.match(q1.text, /Quantas pessoas isso afeta\?/);
  assert.equal(first.collector.actions[0]!.status, "pending");
  assert.deepEqual((first.result.suspended!.payload as SuspendPrompt).stepKey, "impact");

  resetMastra(); // "reinício": nova instância Mastra abrindo o mesmo arquivo de storage

  const second = await run({ resume: { runId: first.result.suspended!.runId, toolCallId: first.result.suspended!.toolCallId, data: { optionId: "eu" } } });
  assert.equal(second.result.finishReason, "suspended");
  assert.match(second.collector.suspended!.prompt.text, /urgência/);
  assert.equal(second.result.suspended!.runId, first.result.suspended!.runId);
  assert.ok((first.result.usage?.inputTokens ?? 0) > 0);
  assert.equal(second.result.usage, undefined); // só a tool rodou: nada a contar

  const third = await run({ resume: { runId: second.result.suspended!.runId, toolCallId: second.result.suspended!.toolCallId, data: { text: "Parou, não consigo trabalhar" } } });
  assert.equal(third.result.suspended, undefined);
  assert.equal(third.result.text, "Aqui está o rascunho. Posso criar?");
  assert.equal(third.collector.pending?.kind, "create-ticket");
  assert.equal((third.collector.pending?.draft as { priority: string }).priority, "alta");
  assert.deepEqual(third.collector.actions.map((a) => a.label), ["montou o chamado", "classificou a prioridade", "verificou duplicidade"]);
  assert.equal(third.collector.actions[0]!.status, "done");
  // Custo: o modelo só roda ao abrir e ao concluir; responder às perguntas intermediárias não chama o LLM.
  assert.equal(model.doStreamCalls.length, 2);
});

test("human-in-the-loop encadeado: suggest-help-article suspende; na retomada o modelo chama open-ticket e a mesma run suspende de novo", async () => {
  // Modelo: 1) sugere o artigo (suspende); 2) ao continuar com "não resolveu", abre o chamado (suspende de novo, outra tool).
  const model = new MastraLanguageModelV2Mock({
    doStream: [
      toolCallStep("suggest-help-article", { source: "article", id: "kb-wifi", problem: "Wi-Fi não conecta no notebook", note: "Confira a rede NEXO-CORP." }, "c1"),
      toolCallStep("open-ticket", { title: "Wi-Fi corporativo não conecta", description: "Notebook não entra na NEXO-CORP; já conferi a rede.", type: "INC", category: "Rede e VPN" }, "c2"),
    ] as never,
  });
  const runner = createMastraRunner({ model: () => model as never });
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" }); // o feedback da sugestão referencia a conversa
  const run = (extra: Partial<AgentRunParams>) => {
    const collector = newCollector();
    const tools = wrapTools(nexoAssistant, collector, () => {}, { hasPendingAction: false });
    return runner({ config: nexoAssistant, tools, requestContext: requestContext(conv.id), system: "ctx", messages: [], onTextDelta: () => {}, ...extra })
      .then((result) => ({ result, collector }));
  };

  const first = await run({ messages: [{ role: "user", content: "meu wifi não conecta" }] });
  assert.equal(first.result.suspended?.toolId, "suggest-help-article");
  const prompt = first.collector.suspended!.prompt;
  assert.match(prompt.text, /isso resolveu\?/);
  assert.equal(prompt.payload?.[0]?.kind, "articles");
  assert.deepEqual(prompt.options?.map((o) => o.id), ["resolveu", "nao-resolveu", "falar-com-um-analista"]);

  resetMastra();

  const second = await run({ resume: { runId: first.result.suspended!.runId, toolCallId: first.result.suspended!.toolCallId, data: { optionId: "nao-resolveu", text: "Não resolveu" } } });
  assert.equal(second.result.finishReason, "suspended");
  assert.equal(second.result.suspended?.toolId, "open-ticket");
  assert.equal(second.result.suspended?.runId, first.result.suspended?.runId);
  assert.notEqual(second.result.suspended?.toolCallId, first.result.suspended?.toolCallId);
  assert.deepEqual(second.collector.actions.map((a) => `${a.label}:${a.status}`), ["sugeriu um artigo da central:done", "montou o chamado:pending"]);
  assert.equal(second.collector.actions[0]!.summary, "Wi-Fi corporativo NEXO-CORP: not_resolved");
  assert.match(second.collector.suspended!.prompt.text, /Quantas pessoas isso afeta\?/);
  assert.equal(model.doStreamCalls.length, 2); // uma chamada por decisão; responder à pergunta do open-ticket não chama o modelo

  const third = await run({ resume: { runId: second.result.suspended!.runId, toolCallId: second.result.suspended!.toolCallId, data: { optionId: "eu" } } });
  assert.equal(third.result.finishReason, "suspended");
  assert.match(third.collector.suspended!.prompt.text, /urgência/);
  assert.equal(model.doStreamCalls.length, 2);
});
