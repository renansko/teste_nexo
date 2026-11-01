# TicketService

Sistema de chamados SIMULADO (legado). Código: `src/services/tickets/ticketService.ts`; regras em `sla.ts`, `priority.ts`, `dedup.ts`; indisponibilidade em `legacyGateway.ts`.

- Não conhece agent, conversa nem LLM. Único consumidor com LLM: as tools da persona ([NexoAssistant](NexoAssistant.md)); sem LLM: executores, rotas `/api/tickets` e console.
- API pública passa por `legacyGateway.call` ([LegacyOutage](../conventions/LegacyOutage.md)): `createTicket`, `getTicket`, `getTicketForRequester`, `listTickets`, `listUpdates`, `addTicketUpdate`, `updateTicketStatus`, `reopenTicket`, `findRelatedTickets`.
- `insertTicketRaw`/`insertUpdateRaw`/`countTickets` não passam pelo gateway: só seed e testes.
- Todas as operações aceitam `now` para determinismo em testes.
- Para trocar por um ITSM real, substitua este módulo mantendo as funções e a entidade [Ticket](../entities/Ticket.md); as regras de prazo/prioridade podem ir junto (são do sistema de chamados, não do agent).
