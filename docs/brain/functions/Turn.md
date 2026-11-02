# Turn

`runTurn({ conversationId, user, input, emit?, runner?, now? })` em `src/engine/conversation/turn.ts`. Devolve `{ conversation, messages }` (mensagens do assistente/sistema produzidas no turno). `turnAsEventStream` embrulha em SSE.

## Ordem de decisão

1. Conversa deve existir e ser do usuário (senão `NOT_FOUND`); `closed` → `CONVERSATION_CLOSED`; limite → `MESSAGE_LIMIT`.
2. Grava a mensagem do usuário (texto, ou rótulo da opção clicada resolvido no último payload `options`).
3. Estado ≠ `agent` → termina (fila do analista).
4. Run suspensa ([HumanInTheLoop](../services/HumanInTheLoop.md)): `cancel`/texto de cancelar descarta e responde (`source: rule`); senão retoma o agent com `{ text, optionId }` e segue ao passo 7.
5. Ação pendente: `confirm` executa pelo outbox ([ActionQueue](../services/ActionQueue.md)); `cancel` descarta; `edit:<key>` reabre o flow; texto livre segue ao agent com o rascunho no contexto.
6. Flow ativo → `advanceFlow`; termina.
6a. Texto livre (sem `optionId`) passa por `checkInput` ([InputPolicy](../conventions/InputPolicy.md)): sem conteúdo útil → resposta `source: rule` com os atalhos da persona e nota `entrada sem conteúdo útil (<motivo>)`; termina sem chamar o modelo.
7. Agent: tools embrulhadas + `requestContext`; histórico = últimas N mensagens (ignorado na retomada: vem do snapshot); `system` volátil (usuário, data, mensagens restantes, rascunho, resumo de transferência).
8. Pós-agent: se a run suspendeu → grava `suspendedRun`, limpa rascunho/flow e responde a pergunta com opções (+ `cancel`) e os cards do próprio prompt (`SuspendPrompt.payload`); nada das consultas do turno vai à tela. Senão: payload (cards + opções mescladas, máx. 6; vazio se o agent iniciou um flow, porque as consultas feitas para decidir não vão à tela); rascunho novo → a mensagem mostra só o rascunho mais o payload do próprio resultado (ex.: chamado relacionado), cards de consulta descartados; confiança baixa → opção de analista, ou transferência automática (`low_confidence`) se a resposta anterior do assistente também foi baixa; grava mensagem com trace; `confirm-pending-action` → executa; `startFlow` → primeira pergunta (segunda mensagem); `afterEffects` (transfer cria mensagem de sistema e muda estado; `link-ticket` grava `ticketId` e vincula o chamado às sugestões da central da conversa, [HelpFeedback](../entities/HelpFeedback.md)) em `src/engine/conversation/effects.ts`, compartilhado com a fila.

## Invariantes

- Um turno pode produzir 0..n mensagens; cada uma emite `message.end`.
- Erros de domínio no SSE viram evento `error` (sem fechar com 4xx); em JSON viram status.
- Mensagem do usuário é gravada mesmo se o agent falhar (`AGENT_ERROR`) ou se for barrada pela validação; o texto gravado é o normalizado (`normalizeInput`).
- O passo 6a é o único ponto por onde texto livre chega ao modelo; `optionId`, flow, rascunho e run suspensa saem antes dele.
- O runner é injetável (`setDefaultRunner`), por isso os testes de rota não chamam modelo.
- `RESUME_GONE` ao retomar (snapshot sumiu) não é erro para o cliente: limpa `suspendedRun` e responde pedindo para recomeçar.

Ver [ChatApi](ChatApi.md), [DecisionTrace](../entities/DecisionTrace.md).
