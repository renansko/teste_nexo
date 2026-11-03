# LegacyOutage

O PRD diz que o sistema de chamados é legado e "de vez em quando fica indisponível por alguns segundos". Simulamos e tratamos. Código: `src/services/tickets/legacyGateway.ts`.

- `legacyGateway.call(fn)`: com probabilidade `NEXO_TICKETS_OUTAGE_RATE` (padrão 0.05) abre uma janela de `NEXO_TICKETS_OUTAGE_MS` (padrão 2000) em que toda chamada lança `TICKET_SERVICE_UNAVAILABLE` (503).
- `withRetry(fn)`: repete só esse erro, 2 vezes (700 ms, 1400 ms), e informa `attempts`; quem chama registra "sistema de chamados instável: N tentativas" no trace.
- Circuit breaker (lado cliente, no mesmo `legacyGateway`): a falha abre o breaker por `breakerMs` (2 s, `BREAKER_MS`); nesse período `withRetry` falha na hora, sem chamar nem dormir (`attempts` 0, `details.circuitOpen: true`, mesmo código 503). Quem encontrou a falha com o breaker fechado faz os retries normalmente (são as sondas); sucesso em qualquer chamada fecha o breaker. Efeito: um usuário sozinho vê o mesmo comportamento de antes (retry recupera o blip); sob carga, ninguém segura conexão 2,1 s para chegar à mesma resposta ([LoadTesting](LoadTesting.md)). `downUntil` (remoto simulado) e `openUntil` (nosso breaker) usam o mesmo `now` injetável; `configure` zera os dois. Por processo: com várias instâncias cada uma aprende sozinha.
- Tools: falha após retries vira `{ error: "TICKET_SERVICE_UNAVAILABLE" }` para o modelo, que avisa o funcionário e pede para tentar de novo (instrução).
- Rotas HTTP de chamados (`/api/tickets`, `/api/tickets/:id`) também usam `withRetry`; só depois dos retries devolvem 503.
- Executores: a ação confirmada já está no outbox; falha após retries só a reagenda ([ActionQueue](../services/ActionQueue.md)). O funcionário não precisa confirmar de novo.
- Dedup no flow: falha vira nota e aviso no rascunho; a checagem é refeita pelo serviço ao gravar ([TicketService](../services/TicketService.md)).
- Testes: `useTempDb` zera a taxa; `legacyGateway.configure({ rate, durationMs, now, random })` injeta relógio e sorteio.
