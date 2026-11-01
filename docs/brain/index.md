# Brain

## Como utilizar

Leia esta página primeiro. Antes de alterar um conceito documentado, consulte entidade, serviço, funções e convenções relacionadas.

## Entidades

- [Conversation](entities/Conversation.md) — Conversa persistida e sua máquina de estados agent ↔ analista.
- [Ticket](entities/Ticket.md) — Chamado simulado de suporte.

## Serviços

- [TicketService](services/TicketService.md) — Serviço de chamados simulado, separado do agent.
- [SupportAgent](services/SupportAgent.md) — Agent Mastra e suas tools.

## Funções

- [HandleMessage](functions/HandleMessage.md) — Contratos de `handleUserMessage` e `handleAnalystAction`.

## Convenções

- [AgentBoundary](conventions/AgentBoundary.md) — O agent só acessa dados via tools.
- [Persistence](conventions/Persistence.md) — SQLite como fonte única de estado.
- [FrontendUI](conventions/FrontendUI.md) — Rotas do front, sessão, SSE/polling e regras de interação dos cards.

## Produto

- [Requirements](product/Requirements.md) — Requisitos técnicos do desafio e decisões pendentes.

## Mapa de símbolos

- `handleUserMessage` → [HandleMessage](functions/HandleMessage.md)
- `createSupportAgent` → [SupportAgent](services/SupportAgent.md)
- `ticketService` → [TicketService](services/TicketService.md)
- `api`, `streamMessage`, `SessionProvider`, `ChatScreen` → [FrontendUI](conventions/FrontendUI.md)
