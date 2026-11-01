# Nexo Assist

Assistente de suporte com agent (Mastra), serviço de chamados simulado e handoff para analista.

## Rodar

```bash
npm install
cp .env.example .env.local   # preencha ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Testes: `npm test` · Tipos: `npm run typecheck`. Requer Node 22.5+.

## Decisões

- **Agent**: Mastra, com tools (`src/agent/tools.ts`).
- **Modelo**: Claude (Anthropic) via `@ai-sdk/anthropic`, configurável em `NEXO_MODEL`; boa aderência a tool use e a instruções em português.
- **Dados**: serviço de chamados simulado em `src/services/tickets`, acessado pelo agent só via tools.
- **Persistência**: SQLite (`node:sqlite`) em `./data/nexo.db`; conversas, chamados e estado sobrevivem a reinício.
- **Estados da conversa**: `agent → waiting_analyst → analyst → closed`.

## API

- `POST /api/chat` `{ conversationId?, message }`
- `GET /api/conversations`, `GET /api/conversations/:id`
- `POST /api/conversations/:id` `{ action: "reply"|"close", message? }` (analista)

Contexto de arquitetura: [`docs/brain/index.md`](docs/brain/index.md).
