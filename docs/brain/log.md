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
- 2026-11-01 | console | Console do analista no front (Anexo C, telas 4 e 5); painel de decisão "Por quê?"/"Ver raciocínio"; confiança baixa em 2 respostas seguidas transfere; `return` direto de `waiting_analyst`; motivo da transferência em texto.
- 2026-11-01 | auth | NEXO_AUTH_SECRET obrigatório em produção (AUTH_NOT_CONFIGURED); sem fallback para o segredo de dev.
- 2026-11-01 | duplicidade | Dedup refeito no banco ao gravar (DUPLICATE_TICKET, BEGIN IMMEDIATE), idempotency_key por rascunho, ActionQueue para pedidos confirmados com o sistema fora, relatedTicketId (agent indica paráfrase, flow confere).
- 2026-11-01 | outbox | Confirmação vira outbox: rascunho sai e ação entra em action_queue na mesma transação; worker retoma itens de processos que caíram (STALE_PROCESSING_MS).
- 2026-11-01 | duplicidade | list-my-tickets purpose=check (sem cards); iniciar flow zera o payload da mensagem do agent; instrução: duplicidade sempre pelo flow.
- 2026-11-01 | rascunho | Turno com rascunho mostra só o rascunho; existingTicketDraft como fonte única (corrige prazo NaN e afetados vazios no complemento).
- 2026-11-01 | central | Busca na central sem payload; cite-articles mostra só artigos usados. Instrução: não narrar fontes ("a central de ajuda não trouxe").
