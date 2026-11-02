# LoadTesting

Teste de carga na escala do PRD (Nexo tem cerca de 2.000 funcionários) sem gastar com o provedor. Código: `src/scripts/load.ts` (`npm run load`), `src/engine/agent/stubRunner.ts`, seleção em `src/engine/conversation/turn.ts` (`productionRunner`), isenção de chave em `src/lib/env.ts` (`isStubModel`). Testes: `stubRunner.test.ts`, `env.test.ts`.

## Contrato

- `NEXO_MODEL=stub/<qualquer>` troca o Mastra pelo runner stub no mesmo seam dos testes (`AgentRunner`). Tudo o mais é o caminho de produção: rota, `runTurn`, tools embrulhadas, trace, SQLite, SSE, outbox, simulação do legado.
- O stub decide por palavras-chave: "chamado/status/INC-" → `list-my-tickets`; "vpn/erro/senha/outlook/…" → `search-help-center` + `cite-articles`; resto → pede detalhes. Sempre chama `report-decision` (confiança `alta`). Nunca suspende a run (não usa tools HITL); numa retomada apenas encerra a pergunta. `usage` vazio no trace (zero tokens).
- `npm run load -- --base URL --employees N --concurrency C --messages M [--think ms] [--no-seed]`. Por padrão cria/garante `N` funcionários `carga-0001@nexo.com`… (ids `load-0001`…, departamento "Carga") direto no banco de `NEXO_DB_PATH`, por isso servidor e script devem apontar para o mesmo arquivo; `--no-seed` para um servidor remoto já semeado.
- Roteiro por funcionário virtual: login → `GET /api/conversations` → `POST /api/conversations` → M mensagens por SSE lidas até `message.end` ("chamados abertos" exercita tool + legado; "vpn erro 809" busca + artigo; "???" é barrada por regra; texto livre) cada uma seguida do polling `?after=` → `GET /api/tickets`.
- Saída: tabela por endpoint (n, erros, p50/p95/p99/max), req/s, turnos/s, respostas por regra, turnos com legado indisponível, eventos `error`, HTTP ≥ 400 e violações de privacidade (conversa ou chamado de outro funcionário). Violação → exit 1.

## Invariantes

- Nenhuma chamada de rede ao provedor com `stub/`: a chave do provedor não é exigida nem lida. O prefixo nunca é padrão e não existe em `.env.example` como valor.
- O stub não mede qualidade de resposta nem latência do modelo: mede o servidor (engine, banco, SSE). Em produção some-se a latência do provedor por turno (segundos), que não consome CPU do servidor, só conexões abertas.
- Banco de carga separado (`NEXO_DB_PATH=./data/load.db`): o teste cria milhares de conversas e mensagens e não deve poluir o banco de desenvolvimento.

## Baseline medido (2026-11-02, WSL2, 16 vCPU, Node 24, build de produção em um processo)

2.000 funcionários, 100 em paralelo, 4 mensagens cada (24.000 requisições, 8.000 turnos). Tabelas no README, seção "Carga". O que os números mostram:

- Capacidade de um processo com este mix: ~100 req/s e ~33 turnos/s, com ou sem a simulação do legado. Em laço fechado a latência é concorrência ÷ vazão: p50 do turno ≈ 1 s com 100 em paralelo. Zero violação de privacidade, zero evento `error` no SSE, RSS de ~250 MB para ~500–560 MB ao fim.
- A simulação do legado (`NEXO_TICKETS_OUTAGE_RATE`, probabilidade por chamada) escala com o tráfego: sob carga as janelas de 2 s se encadeiam e o legado fica "fora" a maior parte do tempo (54% dos turnos que consultam chamados falharam após os retries e responderam com a mensagem de instabilidade; 66% dos `GET /api/tickets` deram 503). É a simulação, não o engine; para medir só o engine, `NEXO_TICKETS_OUTAGE_RATE=0`.
- Bug encontrado e corrigido: `database is locked` no worker da fila quando outro processo escrevia (seed do script); o SQLite abria sem `busy_timeout` ([Persistence](Persistence.md)).
- Limite seguinte na escala de 2.000: o polling do funcionário (6 s em `agent`, 2 s com analista). 2.000 abas abertas seriam ~330 a 1.000 req/s só de polling, acima da capacidade de um processo. Próximo passo: SSE/long-polling também para o funcionário, polling só com a aba visível e resposta 304 sem mudança.

## Decisões

- Runner stub no seam `AgentRunner`, não um modelo simulado dentro do Mastra: o seam já existe, é o que os testes usam e não depende de API interna. Custo: as runs suspensas (storage `mastra.db`) ficam fora da carga.
- Script próprio com `fetch`, sem k6/autocannon: lê SSE, confere privacidade e usa os contratos de `src/lib/api.ts`; sem dependência nova.
- Limites conhecidos para a escala de produto (fora do desafio): um processo e um SQLite por instância; presença "digitando" em memória; polling do funcionário a cada 6 s em `agent` e 2 s com analista (2.000 abas abertas ≈ 350–1.000 req/s só de polling); sem rate limit por IP. Próximo passo seria Postgres, store compartilhado e SSE no console ([README](../../../README.md), trade-offs).
