# ActionQueue

Outbox de ações **confirmadas** pelo funcionário (criar, complementar, reabrir chamado). Garante que uma confirmação nunca se perde nem grava duas vezes. Código: `src/engine/actions/queue.ts`, `executePending` em `src/engine/conversation/turn.ts`; tabela `action_queue` (migração 2); worker iniciado em `src/lib/bootstrap.ts`.

## Fluxo

1. "Confirmar" → **uma transação**: tira o rascunho da conversa e grava a ação em `action_queue` como `processing` (`recordConfirmedAction`). Ou as duas coisas acontecem, ou nenhuma.
2. O executor roda na hora, com `idempotencyKey` = id do rascunho. Sucesso → `done` e resposta no mesmo turno.
3. 503 (ex.: `TICKET_SERVICE_UNAVAILABLE` após os retries de [LegacyOutage](../conventions/LegacyOutage.md)) → `queued` com backoff (5 s, 10 s, 20 s… até 5 min); o funcionário é avisado e não confirma de novo.
4. Erro de regra (ex.: chamado não está mais aberto) → `failed`; o rascunho volta à conversa com **nova** chave.
5. Worker (`processActionQueue`, a cada 5 s): itens `processing` há mais de 2 min (`STALE_PROCESSING_MS`, processo caiu) voltam para `queued`; itens vencidos são reivindicados e reexecutados. Sucesso → mensagem na conversa ("O sistema de chamados voltou." ou "Concluí o pedido que você confirmou."), `afterEffects` e eventual novo rascunho. Após 30 tentativas ou erro não temporário → `failed` e mensagem "Nada foi gravado", com opção de analista.

## Invariantes

- Chave do item = id do rascunho (`PendingAction.id`) = chave de idempotência do executor (unique em `tickets`/`ticket_updates`). Reexecutar nunca grava duas vezes.
- Confirmação repetida em paralelo: o segundo `INSERT` é ignorado e essa requisição responde "já está sendo processado" sem executar.
- Claim atômico (`queued → processing`): dois workers não pegam o mesmo item. Recuperação por tempo, não no boot: reiniciar uma instância não rouba itens que outra está executando.
- Ao executar, o serviço reaplica a regra de duplicidade: se outro chamado parecido foi aberto enquanto o pedido esperava, a criação vira proposta de complemento (nova confirmação).
- Novo rascunho vindo do worker só é aplicado se a conversa está com o agent e sem flow/rascunho; senão fica a mensagem e uma nota no trace.
- Persona-agnóstica: qualquer executor que lance `AppError` com status 503 é reagendado.

## Limites

- Queda depois de gravar e antes de marcar `done`: o chamado não duplica, mas a mensagem de conclusão pode aparecer duas vezes.
- Worker em processo (`setInterval`); em produção, worker dedicado. Mensagens/notificações são gravações locais; envios externos (e-mail, Slack) entrariam neste mesmo outbox.
- O prazo (SLA) do chamado conta a partir do registro, não da confirmação.

Ver [PendingAction](PendingAction.md), [TicketService](TicketService.md), [Turn](../functions/Turn.md).
