# Persistence

Todo estado vive em SQLite (`node:sqlite`, `NEXO_DB_PATH`, padrão `./data/nexo.db`). Código: `src/lib/db.ts`; boot em `src/lib/bootstrap.ts`.

- Migrações versionadas em código (`MIGRATIONS[]`, tabela `schema_migrations`), aplicadas em transação na primeira abertura. Nova mudança de schema = novo item na lista, nunca editar o anterior. A migração 1 derruba as tabelas do esqueleto pré-versão (nunca publicado).
- Colunas JSON: `conversations.active_flow`, `pending_action`, `suspended_run` (migração 2); `messages.payload`, `trace`. Lidas/escritas só pelo `conversationService`.
- Migração 4: `help_feedback` (sugestões da central e resposta do funcionário, [HelpFeedback](../entities/HelpFeedback.md)) e `resolution_memories` (solução do analista por chamado, [ResolutionMemory](../entities/ResolutionMemory.md)); acessadas só por `src/services/helpCenter/*`.
- Sem cache em memória: conversas, chamados, flow e rascunho sobrevivem a reinício por construção (testes fecham e reabrem o banco).
- Segundo arquivo, `mastra.db`, no mesmo diretório: storage do Mastra (`@mastra/libsql`) só para snapshots de runs suspensas ([HumanInTheLoop](../services/HumanInTheLoop.md)); criado por `getMastra()` em `src/engine/agent/mastra.ts`. Com `NEXO_DB_PATH=:memory:` ele também fica em memória.
- `boot()` (rotas) = abrir banco + seed idempotente da persona; `npm run seed` faz o mesmo fora do servidor.
- Testes usam um arquivo temporário por processo (`src/test/helpers.ts`); `node --test` isola cada arquivo de teste num processo.
- `node:sqlite` exige Node 22.5+ (testado em 24). `transaction(fn)` para escritas compostas, com `BEGIN IMMEDIATE`: "ler, decidir, gravar" fica serializado entre processos.
- `PRAGMA busy_timeout = 5000` na abertura: escrita concorrente de outro processo (seed, `npm run load`, segunda instância) espera o lock em vez de falhar na hora com `database is locked` (o worker da fila falhou assim durante o teste de carga, [LoadTesting](LoadTesting.md)). Dentro do processo não há disputa: o driver é síncrono.
- Migração 2: `idempotency_key` (unique parcial) em `tickets`/`ticket_updates` e tabela `action_queue` ([ActionQueue](../services/ActionQueue.md)).
