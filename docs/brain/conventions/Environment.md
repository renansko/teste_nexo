# Environment

Configuração por variáveis de ambiente, validada com zod. Código: `src/lib/env.ts`; boot em `src/instrumentation.ts`. Lista e exemplos em `.env.example`.

## Contrato

- `process.env` só é lido em `src/lib/env.ts` (exceção: `src/test/helpers.ts` define `NEXO_DB_PATH`). Código novo usa `env()`.
- Variável vazia (`FOO=`) conta como ausente: o default vale.
- `env()` valida formato/faixa e aplica defaults; relê a cada chamada (testes trocam variáveis entre casos).
- `assertRuntimeEnv()` roda uma vez no boot do servidor (`register()` do Next) e encerra o processo (exit 1) listando todos os problemas:
  - chave do provedor do modelo, derivada do prefixo de `NEXO_MODEL`/`NEXO_FAST_MODEL` (`openai/...` → `OPENAI_API_KEY`), fora de `NODE_ENV=test`;
  - `NEXO_AUTH_SECRET` em produção (em dev cai no segredo de desenvolvimento com aviso). O `token.ts` também recusa o fallback em produção, para entrypoints que não passem pelo boot — ver [AuthSession](AuthSession.md).
- Mensagens de erro citam o nome da variável e a regra, nunca o valor.

## Decisões

- Duas camadas porque `next build` importa os módulos de rota sem `.env`: validar chaves no import quebraria o build da imagem Docker.
- `NEXO_MODEL`/`NEXO_FAST_MODEL` usam o formato `provedor/modelo` do model router do Mastra (padrão único `openai/gpt-6-luna`); não existe variável de provedor separada. Ver [AssistantConfig](../services/AssistantConfig.md).
- Prefixo `stub/` (`isStubModel`) é um provedor fictício: dispensa chave e troca o Mastra pelo runner determinístico de `src/engine/agent/stubRunner.ts` ([LoadTesting](LoadTesting.md)). Só o modelo com esse prefixo fica isento; o outro continua exigindo a chave. Nunca é padrão nem deve ir para produção.
- Faixas: `NEXO_TICKETS_OUTAGE_RATE` 0..1, `NEXO_BUSINESS_TZ_OFFSET_MINUTES` -720..840, `NEXO_AUTH_SECRET` ≥ 16 caracteres.
- Não há variável para o banco do Mastra: `mastra.db` é derivado do diretório de `NEXO_DB_PATH` ([Persistence](Persistence.md)), para o volume do Docker cobrir os dois arquivos.
