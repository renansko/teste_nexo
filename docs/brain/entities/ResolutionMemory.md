# ResolutionMemory

O que o analista escreveu ao resolver um chamado, guardado como conhecimento pesquisável pelo agent ao lado dos artigos. Código: `rememberResolution`, `searchKnowledge` em `src/services/helpCenter/helpCenterService.ts`; tabela `resolution_memories` (migração 4); origem `POST /api/analyst/tickets/:id/resolve` ([AnalystConsoleApi](../functions/AnalystConsoleApi.md)).

## O que entra e o que nunca entra

- Entra: `title`, `type`, `category` do chamado, `solution` (texto do analista), `triedArticleIds` (fontes sugeridas antes e que não resolveram, de [HelpFeedback](HelpFeedback.md)), `resolvedBy`, `resolvedAt`.
- **Nunca entra**: descrição, atualizações, solicitante ou afetados do chamado (Anexo A: informações de um chamado só para quem o abriu). `ticketId` é referência interna; `getKnowledge`/`searchKnowledge` não o devolvem, então nem o modelo nem o funcionário o veem.
- Uma memória por chamado (`ticket_id` UNIQUE): resolver de novo substitui a solução.

## Como o agent usa

- `search-help-center` devolve artigos e memórias juntos (`KnowledgeHit { source, id, title, body, category }`, `body` = solução), mesma pontuação lexical de [HelpArticle](HelpArticle.md).
- `suggest-help-article` com `source: "resolution"` mostra o card "Caso resolvido" e mede o resultado como qualquer artigo. Assim uma memória que resolve repetidamente é candidata a virar artigo da FAQ (promoção manual, `upsertArticle`; pendência).
- Seed: uma memória de exemplo (`INC-20150`, senha do SAP) entra junto dos chamados em `seedNexo`.

## Resolver um chamado

`resolveTicket` ([TicketService](../services/TicketService.md)) exige chamado vivo (`assertCanUpdate`, senão 409 `TICKET_NOT_OPEN`), grava a atualização `Resolvido: <solução>` com autor analista e marca `resolvido`/`resolvedAt`, tudo numa chamada ao gateway legado. A memória é gravada depois, na nossa base; se o legado falhar nada é gravado em lugar nenhum.
