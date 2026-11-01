/** Verifica a integração com o Mastra usando um modelo simulado (sem rede). */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MastraLanguageModelV2Mock, simulateReadableStream } from "@mastra/core/test-utils/llm-mock";
import { RequestContext } from "@mastra/core/request-context";
import { useTempDb } from "@/test/helpers";
import { nexoAssistant } from "@/assistants/nexo/persona";
import { newCollector, wrapTools } from "@/engine/tools/wrap";
import { createMastraRunner } from "./mastraRunner";
import type { TurnContext } from "@/engine/types";

beforeEach(() => useTempDb({ seed: true }));

const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
const step = (chunks: unknown[]) => ({ stream: simulateReadableStream({ chunks: chunks as never[] }) });

test("agent Mastra chama tool embrulhada com requestContext e devolve texto", async () => {
  const model = new MastraLanguageModelV2Mock({
    doStream: [
      step([
        { type: "stream-start", warnings: [] },
        { type: "tool-call", toolCallId: "c1", toolName: "list-my-tickets", input: JSON.stringify({ status: "open" }) },
        { type: "finish", finishReason: "tool-calls", usage },
      ]),
      step([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Você tem 2 chamados " },
        { type: "text-delta", id: "t1", delta: "abertos." },
        { type: "text-end", id: "t1" },
        { type: "finish", finishReason: "stop", usage },
      ]),
    ] as never,
  });

  const collector = newCollector();
  const tools = wrapTools(nexoAssistant, collector, () => {}, { hasPendingAction: false });
  const requestContext = new RequestContext<TurnContext>();
  requestContext.set("userId", "emp-ana");
  requestContext.set("conversationId", "c");
  requestContext.set("assistantId", "nexo");
  requestContext.set("now", new Date().toISOString());

  const deltas: string[] = [];
  const runner = createMastraRunner({ model: () => model as never });
  const result = await runner({
    config: nexoAssistant, tools, requestContext, system: "ctx",
    messages: [{ role: "user", content: "como estão meus chamados?" }],
    onTextDelta: (d) => deltas.push(d),
  });

  assert.equal(result.text, "Você tem 2 chamados abertos.");
  assert.deepEqual(deltas, ["Você tem 2 chamados ", "abertos."]);
  assert.equal(collector.actions.length, 1);
  assert.equal(collector.actions[0]!.label, "consultou seus chamados");
  assert.equal(collector.actions[0]!.status, "done");
  assert.equal(collector.payload[0]!.kind, "tickets");
  assert.ok((result.usage?.inputTokens ?? 0) > 0);
});
