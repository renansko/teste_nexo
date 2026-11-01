# ChatApi

Contrato HTTP do funcionário. Código: `src/app/api/auth/*`, `src/app/api/conversations/**`, `src/app/api/tickets/**`, `src/app/api/help-center`. Eventos em `src/engine/conversation/events.ts`.

## Rotas

- `POST /api/auth/login {email, password}` → `{ token, user }` + cookie `nexo_session` (401 `INVALID_CREDENTIALS`). `GET /api/auth/me` → `{ user }`. `POST /api/auth/logout`.
- `GET /api/conversations` → `PublicConversation[]` com `lastMessage`. `POST /api/conversations {assistantId?}` → 201 `PublicConversation`.
- `GET /api/conversations/:id` → `{ conversation, messages }`. `GET /api/conversations/:id/messages?after=<id>` → mensagens com id maior (polling).
- `POST /api/conversations/:id/messages {text} | {optionId, text?}` (role `employee`): com `Accept: text/event-stream` → SSE; senão → `{ conversation, messages }`. Erros 409 `CONVERSATION_CLOSED` / `MESSAGE_LIMIT`, 502 `AGENT_ERROR`.
- `GET /api/tickets?open=` → `TicketView[]` (só os meus). `GET /api/tickets/:id` → `{ ticket, updates }` (404 se de outro). `GET /api/help-center?q=`.

`PublicConversation`: `id, assistantId, employeeId, analystId, state, ticketId, userMessages, limit, activeFlowId, hasPendingAction, transferReason, transferSummary, createdAt, updatedAt`. Nunca expõe `pendingAction.input`.

## Mensagem

`{ id, conversationId, role, content, payload: PayloadPart[] | null, trace: Trace | null, createdAt }`. `PayloadPart = { kind, data }`:

| kind | data | origem |
|---|---|---|
| `options` | `QuickOption[] { id, label }` | engine/persona; clique envia `{ optionId }` (ou o rótulo como texto) |
| `draft` | `TicketDraft` | [PendingAction](../services/PendingAction.md) |
| `tickets` | `TicketView[]` | seletor/cards |
| `ticket` | `{ ticket: TicketView, updates }` | detalhe |
| `articles` | `{ id, title, body, category }[]` | central |

Ids de opção reservados: `confirm`, `cancel`, `edit:<step>`; da Nexo: `falar-com-um-analista`, `abrir-um-chamado`, `criar-um-novo-mesmo-assim`, ids de chamado em minúsculas.

## SSE

`event: <tipo>` + `data: <json>` por evento, nesta ordem típica: `message.start {}` → `action {action}` (pending e depois done/error, mesmo id) → `text.delta {delta}` → `payload {part}` → `trace {trace}` → `message.end {message}` (repetido por mensagem) → `conversation {conversation}`. `error {code, message}` pode aparecer a qualquer momento e encerra o stream.

Ver [Turn](Turn.md), [AuthSession](../conventions/AuthSession.md).
