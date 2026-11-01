# AssistantConfig

Seam entre o engine genérico e uma persona. Tipos em `src/engine/types.ts`; registro em `src/engine/registry.ts`; runner em `src/engine/agent/mastraRunner.ts`.

## O que uma persona fornece

- `instructions` estáveis (entram no cache automático de prompt do provedor) e `contextFor` volátil por requisição.
- `tools`: `ToolSpec` = tool Mastra + `label` humano + opcionais `summarize`, `toPayload`, `toModel`, `afterEffects`, `requiresConfirmation`.
- `flows` ([FlowEngine](FlowEngine.md)), `actions` (executores de [PendingAction](PendingAction.md)), `limits` (`maxUserMessages`, `maxSteps`, `historyWindow`), `model`/`fastModel`.

## O que o engine garante

- Chama as tools com `requestContext` `{ userId, conversationId, assistantId, now }`; a persona lê `userId` para escopo/privacidade.
- Embrulha cada tool ([DecisionTrace](../entities/DecisionTrace.md)); acrescenta as tools internas `suggest-quick-replies`, `report-decision` e, se há rascunho, `confirm/cancel-pending-action`.
- A chave da tool enviada ao modelo é o `id` da tool (não a chave do objeto).
- `AgentRunner` (`src/engine/agent/types.ts`) isola o framework: testes injetam um runner roteirizado (`src/test/scriptedRunner.ts`); produção usa Mastra com o model router: `model` é a string `provedor/modelo` de `NEXO_MODEL` (`openai/gpt-6-luna`), o Mastra resolve o provedor e a chave; modelo inválido falha no turno como `AGENT_ERROR`. O contrato inclui `resume`/`suspended` para tools human-in-the-loop ([HumanInTheLoop](HumanInTheLoop.md)).
- Tools podem suspender a run (`suspendSchema`/`resumeSchema` + `hitl(context)`) e devolver `{ outcome: FlowOutcome }`; o wrapper trata os dois casos.
- Erros do modelo viram `AGENT_ERROR` (502) com mensagem genérica; detalhe só no log do servidor.

## Decisões

- Engine não importa `assistants/*`; o registro é o único ponto que conhece a Nexo. Multi-tenant = trocar o mapa por tabela + chave de API.
- Agent Mastra é criado por turno (barato) e registrado na instância `Mastra` única do processo (`getMastra()`), que existe só para o storage das runs suspensas; sem memória do Mastra: o histórico vem do nosso banco (últimas `historyWindow` mensagens).
- Falas do analista e do sistema entram no histórico como turno de usuário com prefixo (`[Mensagem do analista humano]`, `[Sistema]`).
