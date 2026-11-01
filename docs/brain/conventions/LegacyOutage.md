# LegacyOutage

O PRD diz que o sistema de chamados é legado e "de vez em quando fica indisponível por alguns segundos". Simulamos e tratamos. Código: `src/services/tickets/legacyGateway.ts`.

- `legacyGateway.call(fn)`: com probabilidade `NEXO_TICKETS_OUTAGE_RATE` (padrão 0.05) abre uma janela de `NEXO_TICKETS_OUTAGE_MS` (padrão 2000) em que toda chamada lança `TICKET_SERVICE_UNAVAILABLE` (503).
- `withRetry(fn)`: repete só esse erro, 2 vezes (700 ms, 1400 ms), e informa `attempts`; quem chama registra "sistema de chamados instável: N tentativas" no trace.
- Tools: falha após retries vira `{ error: "TICKET_SERVICE_UNAVAILABLE" }` para o modelo, que avisa o funcionário e pede para tentar de novo (instrução).
- Executores: a ação confirmada já está no outbox; falha após retries só a reagenda ([ActionQueue](../services/ActionQueue.md)). O funcionário não precisa confirmar de novo.
- Dedup no flow: falha vira nota e aviso no rascunho; a checagem é refeita pelo serviço ao gravar ([TicketService](../services/TicketService.md)).
- Testes: `useTempDb` zera a taxa; `legacyGateway.configure({ rate, durationMs, now, random })` injeta relógio e sorteio.
