# Conversation

Conversa entre funcionário, assistente (persona) e analista. Código: `src/services/conversations/conversationService.ts`; projeção pública em `src/engine/conversation/view.ts`.

## Estados

`agent` → `waiting_analyst` → `analyst` → `agent` (devolvida) · qualquer → `closed`.

| Transição | Quem | Onde |
|---|---|---|
| `agent → waiting_analyst` | tool `transfer-to-analyst`, chamado crítico criado ou engine (2ª resposta seguida com confiança baixa) | [Turn](../functions/Turn.md) (`AfterEffect` transfer) |
| `agent|waiting_analyst → analyst` | analista (`take`) | [AnalystConsoleApi](../functions/AnalystConsoleApi.md) |
| `analyst → agent` | o mesmo analista (`return`) | idem |
| `waiting_analyst → agent` | qualquer analista (`return`, triagem sem assumir) | idem |
| `* → closed` | analista (`close`) | idem |

## Invariantes

- O funcionário nunca muda o estado; só o engine (regras) e o analista.
- Só em `agent` o assistente responde. Nos outros estados a mensagem do funcionário é gravada e o turno devolve `messages: []`.
- `closed` rejeita mensagens (`CONVERSATION_CLOSED`, 409). `userMessageCount >= limits.maxUserMessages` rejeita (`MESSAGE_LIMIT`, 409); o limite é da persona (30 na Nexo).
- `user_message_count` é incrementado em `addMessage` para `role = user` (contagem única, inclusive mensagens na fila do analista).
- Uma conversa tem no máximo um entre `activeFlow`, `pendingAction` e `suspendedRun` ([HumanInTheLoop](../services/HumanInTheLoop.md)); `take` e `close` limpam os três (e descartam a run suspensa).
- `ticketId` aponta para o último chamado criado/alterado nesta conversa (`AfterEffect` link-ticket).
- `transferSummary` sobrevive à devolução ao agent e entra no contexto do modelo ("já passou por um analista").
- `transferReason` guarda o **código** (`user_request`, `critical`, `overdue`, `low_confidence`); a mensagem de sistema usa o rótulo humano (`AfterEffect.label`), nunca o código.
- Toda conversa tem `assistant_id` (hoje sempre `nexo`), seam para multi-persona.

## Mensagens

`role`: `user`, `agent`, `analyst`, `system`. `payload` (partes estruturadas) e `trace` ([DecisionTrace](DecisionTrace.md)) só em `agent`. Mensagens `system` registram transições (transferida, assumida, devolvida, encerrada) e aparecem ao funcionário e ao analista.

Ver [Turn](../functions/Turn.md), [PendingAction](../services/PendingAction.md), [FlowEngine](../services/FlowEngine.md).
