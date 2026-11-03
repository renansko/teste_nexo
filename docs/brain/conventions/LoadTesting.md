# LoadTesting

Teste de carga na escala do PRD (Nexo tem cerca de 2.000 funcionários) sem gastar com o provedor. Código: `src/scripts/load.ts` (`npm run load`), `src/engine/agent/stubRunner.ts`, seleção em `src/engine/conversation/turn.ts` (`productionRunner`), isenção de chave em `src/lib/env.ts` (`isStubModel`). Testes: `stubRunner.test.ts`, `env.test.ts`.

## Contrato

- `NEXO_MODEL=stub/<qualquer>` troca o Mastra pelo runner stub no mesmo seam dos testes (`AgentRunner`). Tudo o mais é o caminho de produção: rota, `runTurn`, tools embrulhadas, trace, SQLite, SSE, outbox, simulação do legado.
- O stub decide por palavras-chave: "chamado/status/INC-" → `list-my-tickets`; "vpn/erro/senha/outlook/…" → `search-help-center` + `cite-articles`; resto → pede detalhes. Sempre chama `report-decision` (confiança `alta`). Nunca suspende a run (não usa tools HITL); numa retomada apenas encerra a pergunta. `usage` vazio no trace (zero tokens).
- `npm run load -- --base URL --employees N --concurrency C --messages M [--think ms] [--no-seed]`. Por padrão cria/garante `N` funcionários `carga-0001@nexo.com`… (ids `load-0001`…, departamento "Carga") direto no banco de `NEXO_DB_PATH`, por isso servidor e script devem apontar para o mesmo arquivo; `--no-seed` para um servidor remoto já semeado.
- Roteiro por funcionário virtual: login → `GET /api/conversations` → `POST /api/conversations` → M mensagens por SSE lidas até `message.end` ("chamados abertos" exercita tool + legado; "vpn erro 809" busca + artigo; "???" é barrada por regra; texto livre) cada uma seguida do polling `?after=` e de um polling ocioso com `If-None-Match` (espera 304) → `GET /api/tickets`.
- Saída: tabela por endpoint (n, erros, p50/p95/p99/max), req/s, turnos/s, respostas por regra, turnos com legado indisponível, eventos `error`, HTTP ≥ 400, pollings ociosos com 304 e violações de privacidade (conversa ou chamado de outro funcionário). Violação → exit 1.

## Invariantes

- Nenhuma chamada de rede ao provedor com `stub/`: a chave do provedor não é exigida nem lida. O prefixo nunca é padrão e não existe em `.env.example` como valor.
- O stub não mede qualidade de resposta nem latência do modelo: mede o servidor (engine, banco, SSE). Em produção some-se a latência do provedor por turno (segundos), que não consome CPU do servidor, só conexões abertas.
- Banco de carga separado (`NEXO_DB_PATH=./data/load.db`): o teste cria milhares de conversas e mensagens e não deve poluir o banco de desenvolvimento.

## Baseline medido (2026-11-02, WSL2, 16 vCPU, Node 24, build de produção em um processo)

2.000 funcionários, 100 em paralelo, 4 mensagens cada. Tabelas no README, seção "Carga". O que os números mostram:

- Primeira rodada (24.000 requisições, antes das otimizações): ~100 req/s e ~33 turnos/s, p50 do turno ≈ 1,2 s. Em laço fechado a latência é concorrência ÷ vazão. Zero violação de privacidade, zero evento `error` no SSE, RSS de ~250 MB para ~500–560 MB ao fim.
- Segunda rodada (32.000 requisições, com polling ocioso 304, circuit breaker e trava de turno): ~149 req/s e ~37 turnos/s, p50 do turno ≈ 0,7 s, com ou sem a simulação do legado; 8.000 de 8.000 pollings ociosos em 304. O ganho vem de requisições mais baratas (304 sem corpo) e de nenhum turno preso em retries com o legado fora.
- A simulação do legado (`NEXO_TICKETS_OUTAGE_RATE`, probabilidade por chamada) escala com o tráfego: sob carga as janelas de 2 s se encadeiam e o legado fica "fora" a maior parte do tempo. Com o breaker, a maioria dos turnos que consultam chamados responde "instável" na hora (84%, antes 54% após 2,1 s de retries); os `GET /api/tickets` com 503 foram 82% (antes 66%). É a simulação, não o engine; para medir só o engine, `NEXO_TICKETS_OUTAGE_RATE=0`.
- Bug encontrado e corrigido: `database is locked` no worker da fila quando outro processo escrevia (seed do script); o SQLite abria sem `busy_timeout` ([Persistence](Persistence.md)).
- Limite seguinte na escala de 2.000: 2.000 abas abertas e visíveis ainda são ~330 a 1.000 req/s de polling (agora quase todo 304 e nenhum com a aba oculta). Próximo passo: SSE/long-polling também para o funcionário.

## Decisões

- Runner stub no seam `AgentRunner`, não um modelo simulado dentro do Mastra: o seam já existe, é o que os testes usam e não depende de API interna. Custo: as runs suspensas (storage `mastra.db`) ficam fora da carga.
- Script próprio com `fetch`, sem k6/autocannon: lê SSE, confere privacidade e usa os contratos de `src/lib/api.ts`; sem dependência nova.
- Throttling: o que entrou é o que limita custo e protege o processo sem recusar tráfego legítimo (um turno por conversa, breaker no legado, polling barato e pausado). Rate limit por IP/usuário ficou de fora: o problema em 2.000 pessoas é o volume agregado, e um 429 só trocaria lentidão por recusa; por IP ainda vale contra brute force no login (segurança, não desempenho). Semáforo global de chamadas ao modelo (o limite real em produção é o RPM/TPM do provedor) é o próximo guarda-corpo.
- Limites conhecidos para a escala de produto (fora do desafio): um processo e um SQLite por instância; presença "digitando", trava de turno e breaker em memória do processo; sem rate limit por IP. Próximo passo seria Postgres, store compartilhado, `cluster`/várias instâncias e SSE no console ([README](../../../README.md), trade-offs).
