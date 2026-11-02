# HelpFeedback

Resultado de cada sugestão da central de ajuda feita ao funcionário: a métrica de "resolução sem fila" do PRD e de acerto da FAQ. Código: `src/services/helpCenter/feedbackService.ts`; tabela `help_feedback` (migração 4); tool `suggest-help-article` em `src/assistants/nexo/tools/helpCenter.ts`.

## Ciclo

1. `suggest-help-article` (HITL, ver [HumanInTheLoop](../services/HumanInTheLoop.md)) grava a linha como `pending` **antes** de suspender a run, com `source` (`article | resolution`), `sourceId`, `problem` (resumo que o agent passou) e a conversa; o id viaja em `suspendPayload.data.feedbackId`.
2. A resposta do funcionário retoma a run; a tool reexecuta e fecha a linha: `resolved`, `not_resolved`, `analyst` (botões) ou, em texto livre, pelos padrões claros de `interpretFeedback`; o resto fica `unclear` com `employeeText` guardado e o modelo decide.
3. Cancelar (`cancel` / "cancelar") descarta a run sem reexecutar a tool: a linha fica `pending` = sem resposta.
4. Quando a conversa vincula um chamado (efeito `link-ticket`, no turno ou pela [ActionQueue](../services/ActionQueue.md)), `linkTicket` preenche `ticketId` nas linhas da conversa ainda sem chamado. É a trilha "artigo tentado → chamado".

## Invariantes

- Uma linha por sugestão; a mesma conversa pode ter várias. A última resposta vale (`answerFeedback` é idempotente).
- `resolutionRate` = `resolved / (resolved + not_resolved)`; `analyst`, `unclear` e `pending` não entram no denominador (`feedbackMetrics`, rota `GET /api/analyst/help-center/metrics`).
- `triedSourcesForTicket(ticketId)` devolve as fontes com resultado ≠ `resolved` ligadas ao chamado: entra em [ResolutionMemory](ResolutionMemory.md) como `triedArticleIds` (`source:id`).
- A tabela referencia `conversations(id)`: tools rodando fora de uma conversa real falham (`FOREIGN KEY`).
- Nunca guarda o conteúdo do artigo nem dados do chamado; só ids, o problema em uma frase e o texto do funcionário.

Ver [HelpArticle](HelpArticle.md), [NexoAssistant](../services/NexoAssistant.md).
