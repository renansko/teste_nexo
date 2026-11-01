# NexoAssistant

Persona "Nexo Assist". Código: `src/assistants/nexo/persona.ts`, `instructions.ts`, `tools/*`, `flows/openTicket.ts`, `actions.ts`, `payload.ts`, `seed.ts`.

## Tools (nome que o modelo vê → rótulo no trace)

| Tool | Rótulo | Observações |
|---|---|---|
| `search-help-center` | buscou na central de ajuda | payload `articles` (2) |
| `list-my-tickets` | consultou seus chamados | payload `tickets` + opções (até 4 chamados; "Falar com um analista" se há vencido) |
| `get-my-ticket` | consultou o chamado X | payload `ticket` com updates; opção de analista se vencido |
| `open-ticket` | montou o chamado | HITL: pré-preenche título/descrição/tipo/categoria, pergunta o resto suspendendo a run e devolve `{ outcome }` com o rascunho; `forceNew` ignora duplicidade |
| `add-ticket-update` | preparou complemento do chamado X | `requiresConfirmation` → rascunho `update-ticket` |
| `reopen-ticket` | preparou reabertura do chamado X | `requiresConfirmation`; só resolvidos ≤ 7 dias |
| `transfer-to-analyst` | transferiu para um analista | `afterEffects` transfer com motivo e resumo |

Executores (`actions.ts`): `create-ticket` (crítico → transfer automático), `update-ticket`, `reopen-ticket`; todos com retry no legado e `link-ticket`.

## Decisões de prompt

- Instruções estáveis em `instructions.ts` (cacheáveis); nada de data/usuário ali.
- `report-decision` obrigatória como última tool; a confiança declarada é gatilho de segurança no engine. Exceção documentada: quando `open-ticket` pausa a conversa, a decisão vem no turno em que a execução continua.
- Tipo e categoria **não** usam LLM extra: o agent pré-preenche quando tem certeza; a tool pergunta com opções quando não. Impacto e urgência são sempre perguntados ao funcionário (matriz do Anexo A). `fastModel` fica reservado para um classificador/guardrail futuro.
- Modelo único `openai/gpt-6-luna` (`NEXO_MODEL`, formato `provedor/modelo`), `maxSteps: 6`, janela de 20 mensagens, limite de 30 mensagens do funcionário.
- O flow `open-ticket` continua registrado em `flows` só para "Editar X" do rascunho ([FlowEngine](FlowEngine.md)).

Ver [HumanInTheLoop](HumanInTheLoop.md), [PendingAction](PendingAction.md), [ServiceDeskRules](../conventions/ServiceDeskRules.md).
