# HandleMessage

Código: `src/agent/handleMessage.ts`.

## handleUserMessage

`handleUserMessage({ conversationId?, message }): { conversation, reply | null }`

- Cria conversa se o id não existe. Salva a mensagem do cliente.
- Estado ≠ `agent`: retorna `reply: null` (fila do analista).
- Estado `agent`: envia o histórico completo ao agent e salva a resposta.
- Erro: `CONVERSATION_CLOSED`.

## handleAnalystAction

`handleAnalystAction(id, "reply" | "close", message?): Conversation`

- `reply` exige `message`, grava como `analyst` e muda para `analyst`.
- `close` encerra. Erros: `NOT_FOUND`, `MESSAGE_REQUIRED`.
- Sem autenticação por ora (ver [Requirements](../product/Requirements.md)).
