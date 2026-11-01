# Persistence

Todo estado vive em SQLite (`node:sqlite`, `NEXO_DB_PATH`, padrão `./data/nexo.db`). Código: `src/lib/db.ts`; boot em `src/lib/bootstrap.ts`.

- Migrações versionadas em código (`MIGRATIONS[]`, tabela `schema_migrations`), aplicadas em transação na primeira abertura. Nova mudança de schema = novo item na lista, nunca editar o anterior. A migração 1 derruba as tabelas do esqueleto pré-versão (nunca publicado).
- Colunas JSON: `conversations.active_flow`, `pending_action`; `messages.payload`, `trace`. Lidas/escritas só pelo `conversationService`.
- Sem cache em memória: conversas, chamados, flow e rascunho sobrevivem a reinício por construção (testes fecham e reabrem o banco).
- `boot()` (rotas) = abrir banco + seed idempotente da persona; `npm run seed` faz o mesmo fora do servidor.
- Testes usam um arquivo temporário por processo (`src/test/helpers.ts`); `node --test` isola cada arquivo de teste num processo.
- `node:sqlite` exige Node 22.5+ (testado em 24). `transaction(fn)` para escritas compostas.
