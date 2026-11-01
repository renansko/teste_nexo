# Persistence

Todo estado vive em SQLite (`node:sqlite`, `NEXO_DB_PATH`, padrão `./data/nexo.db`). Código: `src/lib/db.ts`.

- Schema criado na primeira abertura (`CREATE IF NOT EXISTS`); sem migrations ainda.
- Sem cache em memória de conversas/chamados: sobrevive a reinício por construção.
- `node:sqlite` é experimental no Node; exige Node 22.5+ (testado em 24).
- Teste: `src/services/persistence.test.ts`.
