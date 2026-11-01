# AgentBoundary

O agent (LLM) só acessa dados por tools, e toda tool recebe o usuário logado pelo `requestContext`. Privacidade e escopo são garantidos no código, não no prompt.

- Aplicar: qualquer nova capacidade do agent vira `ToolSpec` em `src/assistants/nexo/tools/` com `label` humano; escrita vira `requiresConfirmation` ou flow + executor ([PendingAction](../services/PendingAction.md)).
- Aplicar: tools leem `currentUserId(context)` e consultam só o que é do usuário (`getTicketForRequester`, `listTickets({ requesterId })`).
- Não aplicar: persistência de conversa/estado é do engine ([Turn](../functions/Turn.md)); o agent não escreve em conversa.
- Não aplicar: regras do service desk ([ServiceDeskRules](ServiceDeskRules.md)) ficam em `services/tickets`, não no prompt.
- Risco: tool que aceite `requesterId` como input do modelo quebra a privacidade; tool que grave sem rascunho quebra a confirmação.
- `engine/` não importa `assistants/*` ([AssistantConfig](../services/AssistantConfig.md)).
