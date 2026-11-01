# TicketService

Simula um sistema externo de chamados. Código: `src/services/tickets/ticketService.ts`.

- Não conhece agent, conversa nem LLM.
- Dependência: `src/lib/db.ts`. Entidade: [Ticket](../entities/Ticket.md).
- Para trocar por um sistema real, substitua apenas este módulo mantendo as funções (`createTicket`, `getTicket`, `listTickets`, `updateTicketStatus`, `seedTickets`).
- Único consumidor do agent: as tools ([SupportAgent](SupportAgent.md)) e `escalate-to-analyst`.
