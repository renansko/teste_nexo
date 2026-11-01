# Log

- 2026-11-01 | INIT | Brain inicial: Conversation, Ticket, TicketService, SupportAgent, HandleMessage.
- 2026-11-01 | etapa 1 | Schema v1 com migrações; Employee, HelpArticle, Ticket (Anexo A), ServiceDeskRules, LegacyOutage, seed.
- 2026-11-01 | etapa 2 | AuthSession (HMAC); API do funcionário (conversas, chamados, central).
- 2026-11-01 | etapa 3 | Engine: Turn, AssistantConfig, DecisionTrace, ChatApi (SSE); persona Nexo com tools de consulta e transferência.
- 2026-11-01 | etapa 4 | FlowEngine e PendingAction; flow de abertura de chamado, duplicidade e reabertura.
- 2026-11-01 | etapa 5 | AnalystConsoleApi: take/reply/return/close e painel de chamados.
- 2026-11-01 | etapa 6 | README, páginas do Brain reescritas; SupportAgent → NexoAssistant, HandleMessage → Turn.
- 2026-11-01 | front | FrontendUI: login, chat do funcionário (SSE + cards) e perfil sobre o contrato v1.
- 2026-11-01 | docker | Dockerfile (Next standalone, Node 24) e docker-compose com volume para o SQLite.
- 2026-11-01 | llm | Provedor do LLM configurável (`NEXO_LLM_PROVIDER`); padrão passa a ser OpenAI `gpt-5-mini`.
- 2026-11-01 | env | Environment: `.env` validado com zod (`src/lib/env.ts`) e checagem no boot via `instrumentation.ts`.
- 2026-11-01 | estrutura | Model router do Mastra (`NEXO_MODEL=openai/gpt-6-luna`, sem `NEXO_LLM_PROVIDER` nem `@ai-sdk/*`); retry nas rotas `/api/tickets`; `assertCanUpdate`/`assertCanReopen` no TicketService.
