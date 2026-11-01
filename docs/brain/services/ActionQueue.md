# ActionQueue

Fila de ações **já confirmadas** pelo funcionário que não puderam rodar porque o sistema externo estava indisponível. Código: `src/engine/actions/queue.ts`; tabela `action_queue` (migração 2); worker iniciado em `src/lib/bootstrap.ts`.

## Fluxo

1. "Confirmar" → executor falha com erro 503 (ex.: `TICKET_SERVICE_UNAVAILABLE` após os retries de [LegacyOutage](../conventions/LegacyOutage.md)).
2. O engine enfileira (`enqueueAction`), descarta o rascunho e responde "ficou na fila". O funcionário não confirma de novo.
3. O worker (`processActionQueue`, a cada 5 s) reexecuta o mesmo executor com a mesma `idempotencyKey`.
4. Sucesso → mensagem do assistente na conversa ("O sistema de chamados voltou. …"), `afterEffects` aplicados (vínculo, transferência de crítico) e, se o executor devolver um novo rascunho, ele vira a ação pendente.
5. 503 de novo → volta para a fila com backoff (5 s, 10 s, 20 s… até 5 min). Após 30 tentativas ou erro não temporário → `failed` e mensagem "Nada foi gravado", com a opção de chamar um analista.

## Invariantes

- Chave da fila = id do rascunho (`PendingAction.id`) = chave de idempotência do executor. Enfileirar duas vezes é no-op; reprocessar não grava duas vezes (unique index em `tickets`/`ticket_updates`).
- `claim` atômico (`queued → processing`): dois workers não pegam o mesmo item. No boot, `processing` volta para `queued`; a idempotência torna isso seguro.
- Ao executar, a regra de duplicidade é reaplicada pelo serviço: se outro chamado parecido foi aberto enquanto o pedido esperava, a criação vira proposta de complemento (nova confirmação), não um chamado novo.
- Novo rascunho só é aplicado se a conversa está com o agent e sem flow/rascunho; senão fica só a mensagem e uma nota no trace.
- Persona-agnóstica: qualquer executor que lance `AppError` com status 503 é enfileirado.
- Polling do front entrega a mensagem; não há push.

## Limites

- Worker em processo (`setInterval`): com várias instâncias, todas processam a mesma tabela (o claim evita trabalho duplo). Em produção: worker dedicado.
- Prazo (SLA) do chamado conta a partir do registro, não da confirmação.

Ver [PendingAction](PendingAction.md), [TicketService](TicketService.md), [Turn](../functions/Turn.md).
