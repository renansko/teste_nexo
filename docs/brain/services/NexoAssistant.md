# NexoAssistant

Persona "Nexo Assist". Código: `src/assistants/nexo/persona.ts`, `instructions.ts`, `tools/*`, `flows/openTicket.ts`, `actions.ts`, `payload.ts`, `seed.ts`.

## Tools (nome que o modelo vê → rótulo no trace)

| Tool | Rótulo | Observações |
|---|---|---|
| `search-help-center` | buscou na central de ajuda | payload `articles` (2) |
| `list-my-tickets` | consultou seus chamados / verificou se já existe chamado parecido | `purpose=show` (padrão): payload `tickets` + opções (até 4; "Falar com um analista" se há vencido). `purpose=check`: só para o agent checar duplicidade, sem payload |
| `get-my-ticket` | consultou o chamado X | payload `ticket` com updates; opção de analista se vencido |
| `start-open-ticket-flow` | iniciou a abertura de chamado | pré-preenche título/descrição/tipo/categoria; `forceNew` ignora duplicidade; `relatedTicketId` = chamado que o agent julga ser o mesmo problema (pega paráfrases), conferido pelo flow |
| `add-ticket-update` | preparou complemento do chamado X | `requiresConfirmation` → rascunho `update-ticket` |
| `reopen-ticket` | preparou reabertura do chamado X | `requiresConfirmation`; só resolvidos ≤ 7 dias |
| `transfer-to-analyst` | transferiu para um analista | `afterEffects` transfer com motivo e resumo |

Executores (`actions.ts`): `create-ticket` (crítico → transfer automático), `update-ticket`, `reopen-ticket`; todos com retry no legado e `link-ticket`.

## Decisões de prompt

- Instruções estáveis em `instructions.ts` (cacheáveis); nada de data/usuário ali.
- `report-decision` obrigatória como última tool; a confiança declarada é gatilho de segurança no engine.
- Tipo e categoria **não** usam LLM extra: o agent pré-preenche quando tem certeza; o flow pergunta com opções quando não. `fastModel` fica reservado.
- Modelo padrão `claude-sonnet-5-5` (`NEXO_MODEL`), `maxSteps: 6`, janela de 20 mensagens, limite de 30 mensagens do funcionário.

Ver [FlowEngine](FlowEngine.md), [PendingAction](PendingAction.md), [ServiceDeskRules](../conventions/ServiceDeskRules.md).
