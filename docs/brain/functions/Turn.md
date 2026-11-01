# Turn

`runTurn({ conversationId, user, input, emit?, runner?, now? })` em `src/engine/conversation/turn.ts`. Devolve `{ conversation, messages }` (mensagens do assistente/sistema produzidas no turno). `turnAsEventStream` embrulha em SSE.

## Ordem de decisão

1. Conversa deve existir e ser do usuário (senão `NOT_FOUND`); `closed` → `CONVERSATION_CLOSED`; limite → `MESSAGE_LIMIT`.
2. Grava a mensagem do usuário (texto, ou rótulo da opção clicada resolvido no último payload `options`).
3. Estado ≠ `agent` → termina (fila do analista).
4. Run suspensa ([HumanInTheLoop](../services/HumanInTheLoop.md)): `cancel`/texto de cancelar descarta e responde (`source: rule`); senão retoma o agent com `{ text, optionId }` e segue ao passo 7.
5. Ação pendente: `confirm` executa; `cancel` descarta; `edit:<key>` reabre o flow; texto livre segue ao agent com o rascunho no contexto.
6. Flow ativo → `advanceFlow`; termina.
7. Agent: tools embrulhadas + `requestContext`; histórico = últimas N mensagens (ignorado na retomada: vem do snapshot); `system` volátil (usuário, data, mensagens restantes, rascunho, resumo de transferência).
8. Pós-agent: se a run suspendeu → grava `suspendedRun`, limpa rascunho/flow e responde a pergunta com opções (+ `cancel`). Senão: payload (cards + opções mescladas, máx. 6); rascunho novo substitui opções; confiança baixa → opção de analista; grava mensagem com trace; `confirm-pending-action` → executa; `startFlow` → primeira pergunta (segunda mensagem); `afterEffects` (transfer cria mensagem de sistema e muda estado).

## Invariantes

- Um turno pode produzir 0..n mensagens; cada uma emite `message.end`.
- Erros de domínio no SSE viram evento `error` (sem fechar com 4xx); em JSON viram status.
- Mensagem do usuário é gravada mesmo se o agent falhar (`AGENT_ERROR`).
- O runner é injetável (`setDefaultRunner`), por isso os testes de rota não chamam modelo.
- `RESUME_GONE` ao retomar (snapshot sumiu) não é erro para o cliente: limpa `suspendedRun` e responde pedindo para recomeçar.

Ver [ChatApi](ChatApi.md), [DecisionTrace](../entities/DecisionTrace.md).
