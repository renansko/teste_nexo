# NexoAssistant

Persona "Nexo Assist". Código: `src/assistants/nexo/persona.ts`, `instructions.ts`, `tools/*`, `flows/openTicket.ts`, `actions.ts`, `payload.ts`, `seed.ts`.

## Tools (nome que o modelo vê → rótulo no trace)

| Tool | Rótulo | Observações |
|---|---|---|
| `search-help-center` | buscou na central de ajuda (`quiet`: não aparece na linha de passos do chat) | resultados só para o agent ler; payload apenas a opção `abrir-um-chamado`, sempre (regra: da central dá para seguir ao chamado) |
| `cite-articles` (oculta) | — | payload `articles` só com os artigos que o agent usou (máx. 2, ids conferidos); nenhum se nada se aplica |
| `list-my-tickets` | consultou seus chamados / verificou se já existe chamado parecido | `purpose=show` (padrão): payload `tickets` + opções (até 4; "Falar com um analista" se há vencido). `purpose=check`: só para o agent checar duplicidade, sem payload |
| `get-my-ticket` | consultou o chamado X | payload `ticket` com updates; opção de analista se vencido |
| `open-ticket` | montou o chamado | HITL: pré-preenche título/descrição/tipo/categoria, pergunta o resto suspendendo a run e devolve `{ outcome }` com o rascunho; `forceNew` ignora duplicidade; `relatedTicketId` = chamado que o agent julga ser o mesmo problema (pega paráfrases), conferido pelo flow |
| `add-ticket-update` | preparou complemento do chamado X | `requiresConfirmation` → rascunho `update-ticket` |
| `reopen-ticket` | preparou reabertura do chamado X | `requiresConfirmation`; só resolvidos ≤ 7 dias |
| `transfer-to-analyst` | transferiu para um analista | `afterEffects` transfer com motivo e resumo |

Executores (`actions.ts`): `create-ticket` (crítico → transfer automático), `update-ticket`, `reopen-ticket`; todos com retry no legado e `link-ticket`.

## Decisões de prompt

- Instruções estáveis em `instructions.ts` (cacheáveis); nada de data/usuário ali.
- `report-decision` obrigatória como última tool; a confiança declarada é gatilho de segurança no engine. Exceção documentada: quando `open-ticket` pausa a conversa, a decisão vem no turno em que a execução continua.
- Regra geral das tools: consulta é para o agent decidir; o que vai à tela é o que ele escolheu usar (`cite-articles`, `purpose=show`, rascunho). Resultado de busca nunca vira card sozinho; a única exceção determinística é a opção "Abrir um chamado" após a busca na central.
- Tom: o agent não narra fontes ("a central de ajuda não trouxe…"); os passos já aparecem acima da resposta.
- Duplicidade sempre pelo `open-ticket`: o agent checa com `purpose=check`, indica `relatedTicketId` e deixa a tool propor complemento/reabertura com confirmação; não resolve no texto.
- Tipo e categoria **não** usam LLM extra: o agent pré-preenche quando tem certeza; a tool pergunta com opções quando não. Impacto e urgência são sempre perguntados ao funcionário (matriz do Anexo A). `fastModel` fica reservado para um classificador/guardrail futuro.
- Modelo único `openai/gpt-6-luna` (`NEXO_MODEL`, formato `provedor/modelo`), `maxSteps: 6`, janela de 20 mensagens, limite de 30 mensagens do funcionário.
- O flow `open-ticket` continua registrado em `flows` só para "Editar X" do rascunho ([FlowEngine](FlowEngine.md)).

Ver [HumanInTheLoop](HumanInTheLoop.md), [PendingAction](PendingAction.md), [ServiceDeskRules](../conventions/ServiceDeskRules.md).
