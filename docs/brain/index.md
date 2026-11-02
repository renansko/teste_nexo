# Brain

## Como utilizar

Leia esta página primeiro. Antes de alterar um conceito documentado, consulte entidade, serviço, funções e convenções relacionadas. Visão geral e trade-offs estão no [README](../../README.md).

## Entidades

- [Conversation](entities/Conversation.md) — Conversa, estados agent ↔ analista, flow ativo, ação pendente e limite.
- [Ticket](entities/Ticket.md) — Chamado do Anexo A: tipo, categoria, prioridade, prazo, status.
- [Employee](entities/Employee.md) — Funcionário/analista; fonte do login e da privacidade.
- [HelpArticle](entities/HelpArticle.md) — Artigo da central de ajuda e a busca unificada (artigos + memórias).
- [HelpFeedback](entities/HelpFeedback.md) — "Isso resolveu?": resultado de cada sugestão da central, métrica e vínculo com o chamado.
- [ResolutionMemory](entities/ResolutionMemory.md) — Solução escrita pelo analista ao resolver, pesquisável pelo agent; o que nunca entra.
- [DecisionTrace](entities/DecisionTrace.md) — Trace por mensagem: ações, decisão, custo.

## Serviços

- [AssistantConfig](services/AssistantConfig.md) — Seam de persona: o que o engine exige de uma persona.
- [NexoAssistant](services/NexoAssistant.md) — Persona Nexo: instruções, tools, executores.
- [FlowEngine](services/FlowEngine.md) — Chat-formulário determinístico; passos reusados pela tool HITL e por "Editar X".
- [HumanInTheLoop](services/HumanInTheLoop.md) — Tool suspende a run do agent para perguntar e retoma com a resposta (Mastra suspend/resume).
- [PendingAction](services/PendingAction.md) — Rascunho e confirmação obrigatória antes de efeitos.
- [TicketService](services/TicketService.md) — Sistema de chamados simulado e gateway legado.
- [ActionQueue](services/ActionQueue.md) — Outbox de ações confirmadas: registro atômico, retomada após queda, fila durante indisponibilidade.

## Funções

- [Turn](functions/Turn.md) — Ordem de decisão de um turno (`runTurn`).
- [ChatApi](functions/ChatApi.md) — Contrato HTTP do funcionário, eventos SSE e payloads.
- [AnalystConsoleApi](functions/AnalystConsoleApi.md) — Contrato do console do analista e transições.

## Convenções

- [AgentBoundary](conventions/AgentBoundary.md) — O agent só acessa dados via tools com contexto do usuário.
- [ServiceDeskRules](conventions/ServiceDeskRules.md) — Anexo A em código: prioridade, prazo, duplicidade, escopo.
- [AuthSession](conventions/AuthSession.md) — Token HMAC, cookie e Bearer, roles.
- [LegacyOutage](conventions/LegacyOutage.md) — Indisponibilidade simulada e retry.
- [Environment](conventions/Environment.md) — Variáveis validadas com zod, provedor do LLM e checagem no boot.
- [Persistence](conventions/Persistence.md) — SQLite, migrações, JSON em colunas.
- [FrontendUI](conventions/FrontendUI.md) — Rotas do front, sessão, SSE/polling, cards, console do analista e painel de decisão.
- [InputPolicy](conventions/InputPolicy.md) — Validação determinística do texto livre antes do modelo; política por persona; resposta por regra.

## Produto

- [Requirements](product/Requirements.md) — Resumo do PRD do desafio e pendências.

## Mapa de símbolos

- `runTurn`, `turnAsEventStream` → [Turn](functions/Turn.md)
- `checkInput`, `normalizeInput`, `resolveInputPolicy`, `publicInputPolicy`, `DEFAULT_INPUT_POLICY` → [InputPolicy](conventions/InputPolicy.md)
- `searchKnowledge`, `getKnowledge`, `rememberResolution` → [HelpArticle](entities/HelpArticle.md), [ResolutionMemory](entities/ResolutionMemory.md)
- `openFeedback`, `answerFeedback`, `linkTicket`, `feedbackMetrics`, `suggestHelpArticle`, `interpretFeedback` → [HelpFeedback](entities/HelpFeedback.md)
- `resolveTicket` → [ResolutionMemory](entities/ResolutionMemory.md), [TicketService](services/TicketService.md)
- `wrapTools`, `TurnCollector` → [DecisionTrace](entities/DecisionTrace.md)
- `startFlow`, `advanceFlow`, `resumeAtStep`, `answerStep`, `questionFor` → [FlowEngine](services/FlowEngine.md)
- `hitl`, `observeSuspend`, `getMastra`, `discardSuspendedRun`, `openTicket` → [HumanInTheLoop](services/HumanInTheLoop.md)
- `interpretPendingInput`, `pendingParts` → [PendingAction](services/PendingAction.md)
- `takeConversation`, `returnToAgent`, `closeConversation` → [AnalystConsoleApi](functions/AnalystConsoleApi.md)
- `signSession`, `requireSession` → [AuthSession](conventions/AuthSession.md)
- `priorityFor`, `computeDueAt`, `findRelated` → [ServiceDeskRules](conventions/ServiceDeskRules.md)
- `legacyGateway`, `withRetry` → [LegacyOutage](conventions/LegacyOutage.md)
- `recordConfirmedAction`, `processActionQueue`, `startActionQueueWorker`, `withActionId` → [ActionQueue](services/ActionQueue.md)
- `nexoAssistant`, `openTicketFlow`, `nexoActions`, `openTicket` → [NexoAssistant](services/NexoAssistant.md)
- `env`, `assertRuntimeEnv`, `apiKeyVarFor` → [Environment](conventions/Environment.md)
- `api`, `analystApi`, `streamMessage`, `SessionProvider`, `ChatScreen`, `AnalystConsole` → [FrontendUI](conventions/FrontendUI.md)
- `DecisionDetails`, `LOW_CONFIDENCE_REASON` → [DecisionTrace](entities/DecisionTrace.md)
