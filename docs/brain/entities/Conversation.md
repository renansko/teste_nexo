# Conversation

Conversa persistida entre cliente, agent e analista. Código: `src/services/conversations.ts`, tabelas `conversations`/`messages` em `src/lib/db.ts`.

## Estados

`agent` → `waiting_analyst` → `analyst` → `closed`. `closed` pode ser definido pelo analista a qualquer momento.

## Invariantes

- Só em `agent` o agent responde. Em qualquer outro estado a mensagem do cliente é salva e não gera resposta automática.
- `closed` rejeita novas mensagens (`CONVERSATION_CLOSED`, HTTP 409).
- `waiting_analyst` é definido somente pela tool `escalate-to-analyst`, que também cria e vincula um [Ticket](Ticket.md).
- `analyst` é definido quando o analista responde.
- Estado e mensagens sobrevivem a reinício ([Persistence](../conventions/Persistence.md)).

Ver [HandleMessage](../functions/HandleMessage.md).
