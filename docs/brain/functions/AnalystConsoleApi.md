# AnalystConsoleApi

Console do analista (role `analyst`). Código: `src/app/api/analyst/**`, transições em `src/engine/conversation/state.ts`, projeções em `src/engine/conversation/analystView.ts`.

## Rotas

- `GET /api/analyst/conversations?state=&q=` → `AnalystConversationItem[]`, **um item por funcionário**: a conversa ativa dele (`activeConversation`: aguardando > em atendimento > com agent > encerrada; empate, a mais recente) = `PublicConversation` + `employee {id,name,email,department}`, `analyst {id,name} | null`, `lastMessage` (última fala; mensagem de sistema só se não houver fala), `waitingSince` (só em `waiting_analyst`), `threadSize` (total de conversas da pessoa). `state` filtra pela ativa; `q` busca em nome/e-mail/resumo/última mensagem e nos chamados de todas as conversas da pessoa. Ordem: aguardando → em atendimento → com agent → encerradas.
- `GET /api/analyst/conversations/:id` → `{ conversation, messages (com trace), employee, tickets: TicketView[] | null, thread, typing: { employee } }`. `thread` = as outras conversas do funcionário (`{ conversation, messages }[]`, da mais antiga para a mais nova, sem a `:id`): o console as mostra no mesmo chat; ações (`take`/`messages`/`return`/`close`) continuam por conversa, sobre a `:id`. (painel do funcionário; `typing.employee` = funcionário digitando agora, presença em memória de [ChatApi](ChatApi.md)). `tickets: null` = sistema de chamados indisponível após retries ([LegacyOutage](../conventions/LegacyOutage.md)); a conversa carrega mesmo assim e o console mostra o aviso só no painel.
- `POST .../:id/take` → assume (`analyst`); `POST .../:id/messages {text}` → responde; `POST .../:id/return` → devolve ao agent; `POST .../:id/close` → encerra. Todas devolvem `{ conversation, messages }` com as mensagens de sistema/analista criadas.
- `GET /api/analyst/employees/:id/tickets` → `{ employee, tickets }`.
- `POST /api/analyst/tickets/:id/resolve {solution}` (10–2000 caracteres) → `{ ticket: TicketView, memoryId }`: chamado vivo passa a `resolvido` com a atualização `Resolvido: …` e a solução vira [ResolutionMemory](../entities/ResolutionMemory.md). 404 inexistente, 409 `TICKET_NOT_OPEN`, 503 legado após retries. Sem botão no console ainda (pendência em [FrontendUI](../conventions/FrontendUI.md)).
- `GET /api/analyst/help-center/metrics` → por artigo/solução: `shown`, `resolved`, `notResolved`, `analyst`, `unclear`, `pending`, `resolutionRate`, `title` ([HelpFeedback](../entities/HelpFeedback.md)).

## Regras

- `take`: de `agent` ou `waiting_analyst`; descarta flow e rascunho; se já é do mesmo analista, idempotente; de outro analista → 409 `ALREADY_TAKEN`; encerrada → 409 `CONVERSATION_CLOSED`. Dispara `onTaken` (chamado vinculado → `em_atendimento`, best-effort; [Ticket](../entities/Ticket.md)).
- `POST .../:id/typing` → `{ ok }`: marca "analista digitando" por 4 s; só quem assumiu (409 `NOT_ASSIGNED`); responder limpa a marca. O funcionário lê em `messages?after=`.
- `messages`: só quem assumiu (409 `NOT_ASSIGNED`). `return`: em `analyst`, só quem assumiu; em `waiting_analyst`, qualquer analista (devolver sem assumir, como no protótipo); outros estados → 409 `NOT_ASSIGNED`.
- `return`: limpa `analystId` e `transferReason`, mantém `transferSummary` (contexto para o agent).
- `close`: idempotente; funcionário recebe 409 ao tentar enviar depois.
- Funcionário só vê as respostas do analista por `GET /api/conversations/:id/messages?after=` (polling); não há push.
- Funcionário com role `employee` recebe 403 em qualquer rota `/api/analyst/*`.

Ver [Conversation](../entities/Conversation.md).
