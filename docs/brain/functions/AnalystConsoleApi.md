# AnalystConsoleApi

Console do analista (role `analyst`). Código: `src/app/api/analyst/**`, transições em `src/engine/conversation/state.ts`, projeções em `src/engine/conversation/analystView.ts`.

## Rotas

- `GET /api/analyst/conversations?state=&q=` → `AnalystConversationItem[]` = `PublicConversation` + `employee {id,name,email,department}`, `analyst {id,name} | null`, `lastMessage` (última fala; mensagem de sistema só se não houver fala), `waitingSince` (só em `waiting_analyst`). Ordem: aguardando → em atendimento → com agent → encerradas; `q` busca em nome/e-mail/chamado/resumo/última mensagem.
- `GET /api/analyst/conversations/:id` → `{ conversation, messages (com trace), employee, tickets: TicketView[] | null }` (painel do funcionário). `tickets: null` = sistema de chamados indisponível após retries ([LegacyOutage](../conventions/LegacyOutage.md)); a conversa carrega mesmo assim e o console mostra o aviso só no painel.
- `POST .../:id/take` → assume (`analyst`); `POST .../:id/messages {text}` → responde; `POST .../:id/return` → devolve ao agent; `POST .../:id/close` → encerra. Todas devolvem `{ conversation, messages }` com as mensagens de sistema/analista criadas.
- `GET /api/analyst/employees/:id/tickets` → `{ employee, tickets }`.

## Regras

- `take`: de `agent` ou `waiting_analyst`; descarta flow e rascunho; se já é do mesmo analista, idempotente; de outro analista → 409 `ALREADY_TAKEN`; encerrada → 409 `CONVERSATION_CLOSED`. Dispara `onTaken` (chamado vinculado → `em_atendimento`, best-effort; [Ticket](../entities/Ticket.md)).
- `messages`: só quem assumiu (409 `NOT_ASSIGNED`). `return`: em `analyst`, só quem assumiu; em `waiting_analyst`, qualquer analista (devolver sem assumir, como no protótipo); outros estados → 409 `NOT_ASSIGNED`.
- `return`: limpa `analystId` e `transferReason`, mantém `transferSummary` (contexto para o agent).
- `close`: idempotente; funcionário recebe 409 ao tentar enviar depois.
- Funcionário só vê as respostas do analista por `GET /api/conversations/:id/messages?after=` (polling); não há push.
- Funcionário com role `employee` recebe 403 em qualquer rota `/api/analyst/*`.

Ver [Conversation](../entities/Conversation.md).
