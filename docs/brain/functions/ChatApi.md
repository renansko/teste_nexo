# ChatApi

Contrato HTTP do funcionário. Código: `src/app/api/auth/*`, `src/app/api/conversations/**`, `src/app/api/tickets/**`, `src/app/api/help-center`. Eventos em `src/engine/conversation/events.ts`.

## Rotas

- `POST /api/auth/login {email, password}` → `{ token, user }` + cookie `nexo_session` (401 `INVALID_CREDENTIALS`). `GET /api/auth/me` → `{ user }`. `POST /api/auth/logout`.
- `GET /api/conversations` → `PublicConversation[]` com `lastMessage`. `POST /api/conversations {assistantId?}` → 201 `PublicConversation`.
- `GET /api/conversations/:id` → `{ conversation, messages }`. `GET /api/conversations/:id/messages?after=<id>` → `{ conversation, messages (id maior), typing: { analyst } }` (polling; `typing.analyst` = analista digitando agora). Responde `ETag` (fraco: `updatedAt` da conversa, id da última mensagem, digitando); com `If-None-Match` igual → `304` sem corpo, sem montar conversa nem mensagens. O `after` não entra na tag: o cliente só avança `after` com o que já recebeu, então "estado igual" implica "nada novo para ele".
- `POST /api/conversations/:id/typing` (role `employee`, dona da conversa) → `{ ok }`: marca "digitando" por 4 s (`src/engine/conversation/presence.ts`, em memória, não persiste); o cliente reenvia a cada ~1,5 s enquanto digita e só com analista envolvido. 409 `CONVERSATION_CLOSED`. Enviar mensagem limpa a marca.
- `POST /api/conversations/:id/messages {text} | {optionId, text?}` (role `employee`): com `Accept: text/event-stream` → SSE; senão → `{ conversation, messages }`. Erros 409 `CONVERSATION_CLOSED` / `MESSAGE_LIMIT` / `TURN_IN_PROGRESS` (já há um turno rodando nesta conversa; a mensagem não é gravada), 502 `AGENT_ERROR`; `text` acima de 4000 caracteres → 400 `INVALID_BODY`. Texto livre sem conteúdo útil não é erro: recebe resposta `source: rule` ([InputPolicy](../conventions/InputPolicy.md)).
- `GET /api/tickets?open=` → `TicketView[]` (só os meus). `GET /api/tickets/:id` → `{ ticket, updates }` (404 se de outro). `GET /api/help-center?q=`.

`PublicConversation`: `id, assistantId, employeeId, analystId, state, ticketId, userMessages, limit, activeFlowId, suspendedTool, hasPendingAction, transferReason, transferSummary, inputPolicy, createdAt, updatedAt`. `inputPolicy` = política de validação da persona sem `options` (`minChars, maxChars, minDistinctAlnum, allowDigitsOnly, allowedChars?, hint?`), para o cliente aplicar a mesma regra. Nunca expõe `pendingAction.input` nem o `runId` da run suspensa (`suspendedTool` é só o id da tool que perguntou).

## Mensagem

`{ id, conversationId, role, content, payload: PayloadPart[] | null, trace: Trace | null, createdAt }`. `PayloadPart = { kind, data }`:

| kind | data | origem |
|---|---|---|
| `options` | `QuickOption[] { id, label }` | engine/persona; clique envia `{ optionId }` (ou o rótulo como texto) |
| `draft` | `TicketDraft` | [PendingAction](../services/PendingAction.md) |
| `tickets` | `TicketView[]` | seletor/cards |
| `ticket` | `{ ticket: TicketView, updates }` | detalhe |
| `articles` | `{ id, title, body, category, source? }[]` (`source`: `article` ou `resolution`, rótulo "Caso resolvido") | central (`cite-articles`, `suggest-help-article`) |

Ids de opção reservados: `confirm`, `cancel` (rascunho, flow e pergunta HITL), `edit:<step>`; da Nexo: `falar-com-um-analista`, `abrir-um-chamado`, `criar-um-novo-mesmo-assim`, `resolveu`, `nao-resolveu` (resposta à sugestão da central), ids de chamado em minúsculas.

## SSE

`event: <tipo>` + `data: <json>` por evento, nesta ordem típica: `message.start {}` → `action {action}` (pending e depois done/error, mesmo id) → `text.delta {delta}` → `payload {part}` → `trace {trace}` → `message.end {message}` (repetido por mensagem) → `conversation {conversation}`. `error {code, message}` pode aparecer a qualquer momento e encerra o stream.

Ver [Turn](Turn.md), [AuthSession](../conventions/AuthSession.md).
