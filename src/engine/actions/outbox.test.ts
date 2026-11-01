/** Outbox de ações confirmadas: registro atômico na confirmação, retomada após queda do processo, confirmação repetida. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { useTempDb } from "@/test/helpers";
import { scriptedRunner } from "@/test/scriptedRunner";
import { transaction } from "@/lib/db";
import { getEmployee } from "@/services/employees/employeeService";
import { createConversation, getConversation, listMessages, updateConversation } from "@/services/conversations/conversationService";
import { listTickets } from "@/services/tickets/ticketService";
import { runTurn } from "@/engine/conversation/turn";
import type { PendingAction, TurnInput } from "@/engine/types";
import { listQueuedActions, processActionQueue, recordConfirmedAction, STALE_PROCESSING_MS } from "./queue";
import { withActionId } from "./pending";

beforeEach(() => useTempDb({ seed: true }));

const ana = () => getEmployee("emp-ana")!;
const neverRunner = scriptedRunner(() => { throw new Error("o agent não deveria rodar"); });
const MOUSE = { title: "Mouse sem fio não pareia", description: "Troquei a pilha e nada.", type: "INC", category: "Hardware" };

/** Conversa até o rascunho de criação; devolve a ação pendente. */
async function draft(): Promise<{ convId: string; send: (i: TurnInput) => ReturnType<typeof runTurn>; pending: PendingAction & { id: string } }> {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const starter = scriptedRunner(async (_p, tool) => { await tool("start-open-ticket-flow", MOUSE); return "Vou abrir."; });
  await runTurn({ conversationId: conv.id, user: ana(), input: { text: "abrir chamado" }, runner: starter });
  const send = (input: TurnInput) => runTurn({ conversationId: conv.id, user: ana(), input, runner: neverRunner });
  await send({ optionId: "eu" });
  await send({ optionId: "atrapalha" });
  const pending = getConversation(conv.id)!.pendingAction!;
  assert.ok(pending.id, "rascunho sem id (chave de idempotência)");
  return { convId: conv.id, send, pending: pending as PendingAction & { id: string } };
}

test("toda confirmação passa pelo outbox: registrada e marcada como concluída", async () => {
  const { convId, send, pending } = await draft();
  await send({ optionId: "confirm" });
  const [item] = listQueuedActions({ conversationId: convId });
  assert.equal(item?.id, pending.id);
  assert.equal(item?.status, "done");
  assert.equal(item?.attempts, 1);
});

test("processo cai entre confirmar e executar: o worker retoma depois do prazo de 'processing' e não perde o pedido", async () => {
  const { convId, pending } = await draft();
  // Estado exato que a confirmação deixa antes de chamar o executor (o processo "morre" aqui).
  const now = new Date();
  transaction(() => {
    updateConversation(convId, { pendingAction: null }, now);
    recordConfirmedAction({ conversationId: convId, userId: "emp-ana", pending, now });
  });
  assert.equal(listTickets({ requesterId: "emp-ana" }).filter((t) => t.title === MOUSE.title).length, 0);

  const at = (ms: number) => () => new Date(now.getTime() + ms);
  assert.deepEqual(await processActionQueue({ now: at(30_000) }), { done: 0, retried: 0, failed: 0 }); // pode estar executando ainda
  assert.deepEqual(await processActionQueue({ now: at(STALE_PROCESSING_MS + 1_000) }), { done: 1, retried: 0, failed: 0 });

  assert.equal(listTickets({ requesterId: "emp-ana" }).filter((t) => t.title === MOUSE.title).length, 1);
  assert.match(listMessages(convId).at(-1)!.content, /^Concluí o pedido que você confirmou\. Chamado INC-\d+ criado/);
  assert.equal(listQueuedActions({ conversationId: convId })[0]?.status, "done");
});

test("processo cai DEPOIS de gravar o chamado e antes de marcar concluído: retomar não duplica", async () => {
  const { convId, send, pending } = await draft();
  await send({ optionId: "confirm" }); // gravou o chamado e marcou done
  // Simula a queda antes do markDone: item volta a 'processing' antigo.
  const { getDb } = await import("@/lib/db");
  getDb().prepare(`UPDATE action_queue SET status = 'processing', updated_at = '1970-01-01T00:00:00.000Z' WHERE id = ?`).run(pending.id);
  await processActionQueue();
  assert.equal(listTickets({ requesterId: "emp-ana" }).filter((t) => t.title === MOUSE.title).length, 1);
});

test("confirmação repetida da mesma ação não executa duas vezes", () => {
  const conv = createConversation({ assistantId: "nexo", employeeId: "emp-ana" });
  const pending = withActionId({ kind: "create-ticket", label: "criar", input: {}, draft: {}, createdAt: "" });
  const now = new Date();
  assert.equal(recordConfirmedAction({ conversationId: conv.id, userId: "emp-ana", pending, now }), true);
  assert.equal(recordConfirmedAction({ conversationId: conv.id, userId: "emp-ana", pending, now }), false);
});
