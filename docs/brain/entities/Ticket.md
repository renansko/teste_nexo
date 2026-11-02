# Ticket

Chamado do service desk (Anexo A). Código: `src/services/tickets/types.ts`, `ticketService.ts`.

- Id `INC-2xxxx` (incidente) ou `REQ-1xxxx` (requisição), sequencial por prefixo (`ticket_sequences`); o seed fixa ids do PRD (ex.: `INC-20311`).
- Categorias: Acesso, Rede e VPN, Hardware, Software, E-mail, Outros.
- Prioridade `critica | alta | media | baixa`; status `aberto | em_atendimento | aguardando_analista | aprovado | resolvido | fechado`. Status "vivos" (`OPEN_STATUSES`): os quatro primeiros.
- Campos obrigatórios na abertura: título, descrição, tipo, categoria, prioridade, afetados (`affected`, texto).
- `dueAt` = prazo da próxima resposta/atualização, calculado pela prioridade ([ServiceDeskRules](../conventions/ServiceDeskRules.md)); **renovado em toda atualização** e na reabertura. Vencido = status vivo e `now > dueAt` (`toView(...).overdue`).
- `resolvedAt` marca a resolução; reabertura só até 7 dias depois (`REOPEN_NOT_ALLOWED` senão) e volta a `aberto`.
- Atualizações (`ticket_updates`) têm autor e papel (`employee | analyst | agent | system`).
- Privacidade: `getTicketForRequester` devolve `undefined` para chamado de outro funcionário; a API responde 404, nunca 403 (não revela existência).
- **Sincronia com a conversa** (ganchos da persona, `src/assistants/nexo/hooks.ts`, via `AssistantConfig.hooks`): conversa transferida → chamado vinculado `aberto|em_atendimento` passa a `aguardando_analista`; analista assume → `aberto|aguardando_analista` passa a `em_atendimento`. Devolver/encerrar não mexem no chamado (o analista decide o desfecho no sistema de chamados). Best-effort: com o legado fora, a conversa muda e o chamado fica como estava (teste em `flows/openTicket.test.ts`). `dueAt` não é renovado por mudança de status.

`TicketView` (o que sai para cliente e modelo) acrescenta `overdue`, `priorityLabel`, `statusLabel`, `slaLabel`.

Ver [TicketService](../services/TicketService.md).
