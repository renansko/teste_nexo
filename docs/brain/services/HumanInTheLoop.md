# HumanInTheLoop

Uma tool pode parar a run do agent para perguntar algo ao funcionário e continuar de onde parou quando ele responder (suspend/resume nativo do Mastra). Usam: `open-ticket` (perguntas do chamado) e `suggest-help-article` ("isso resolveu?", [HelpFeedback](../entities/HelpFeedback.md)). Código: `src/engine/tools/hitl.ts`, `src/engine/tools/wrap.ts`, `src/engine/agent/mastra.ts`, `src/engine/agent/mastraRunner.ts`, `src/engine/conversation/turn.ts`, `src/assistants/nexo/tools/ticketActions.ts`, `src/assistants/nexo/tools/helpCenter.ts`.

## Contrato

- A tool declara `suspendSchema` (formato `SuspendPrompt { text, options?, stepKey?, data?, cancelText? }`) e `resumeSchema` (`TurnInput { text?, optionId? }`), e dentro de `execute` lê `hitl(context)`: `suspend(prompt)` + `return` para perguntar; `resumeData`/`suspendPayload` presentes só na retomada.
- Na retomada a tool roda **de novo com o input original**; todo progresso (respostas acumuladas, passo atual) tem de viajar em `suspendPayload.data`/`stepKey`. Validação da resposta também é da tool (re-suspende com o erro como prefixo).
- O engine renderiza `text` + `options` (+ `cancel`) e os cards de `payload` do prompt (ex.: o artigo sugerido) como mensagem do agent; não interpreta `stepKey`/`data`. Consultas feitas antes no mesmo turno não vão à tela.
- Na retomada o modelo pode chamar **outra** tool HITL e a mesma run suspende de novo (novo `toolCallId`): sugestão → "não resolveu" → `open-ticket` na mesma run, sem turno novo (`mastraRunner.test.ts`, caso encadeado).
- Para concluir, a tool devolve `{ outcome: FlowOutcome }`: rascunho (`pendingAction`), payload e ações sintéticas entram no turno como se viessem do flow ([PendingAction](PendingAction.md)).

## Engine

- `wrapTools` repassa os schemas e observa `context.agent.suspend` (no Mastra 1.x as primitivas vivem em `context.agent`; `hitl()` abstrai isso): registra `collector.suspended`, deixa a ação do trace com `status: pending` e `summary: "perguntou: …"`.
- Runner: `AgentRunParams.resume { runId, toolCallId, data }` → `agent.resumeStream`; `AgentRunResult.suspended { runId, toolCallId, toolId, payload }` vem do chunk `tool-call-suspended` (`finishReason: "suspended"`). Histórico e `system` da retomada vêm do snapshot (o `messages` do turno é ignorado).
- Turno ([Turn](../functions/Turn.md)): com `conversation.suspendedRun`, cancelar (`cancel`/texto) descarta a run (`source: rule`); qualquer outra entrada retoma a run com `{ text, optionId }`. Nova suspensão grava `suspendedRun` e responde a pergunta; conclusão limpa `suspendedRun` e segue o pós-processamento normal (rascunho, efeitos).
- Persistência: `conversations.suspended_run` (JSON `SuspendedRun { runId, toolCallId, toolId, prompt, startedAt }`); o snapshot da run fica no storage do Mastra (`LibSQLStore`, arquivo `mastra.db` ao lado de `NEXO_DB_PATH`; `:memory:` quando o banco é em memória). `getMastra()` é singleton e o Agent de cada turno é registrado nele (`__registerMastra`, API marcada `@internal` no Mastra: coberta pelo teste de integração).

## Invariantes

- No máximo um entre `activeFlow`, `pendingAction` e `suspendedRun`; suspender limpa os outros dois; `take`/`close` do analista limpam e descartam a run.
- `discardSuspendedRun(runId)` apaga o snapshot (workflows `agentic-loop`/`agentic-execution`) em cancelamento/take/close, best-effort. Runs concluídas o Mastra apaga sozinho.
- Mensagem da pergunta: `source: agent`, sem `decision` (o modelo não chegou ao `report-decision`); a regra "confiança baixa → analista" não se aplica a ela.
- Snapshot ausente/inválido ao retomar → `RESUME_GONE`: o turno limpa `suspendedRun` e pede para recomeçar (`source: rule`). Dois POSTs simultâneos na mesma run: o Mastra só deixa um retomar (CAS `suspended → pending`); o outro vira `AGENT_ERROR` e a run volta a `suspended`.
- Custo: ao retomar, o Mastra reexecuta só a tool; se ela suspende de novo, o modelo **não** é chamado. O LLM roda duas vezes por abertura (chamar `open-ticket` e redigir a resposta com o rascunho), independente do número de perguntas (`mastraRunner.test.ts` fixa `doStreamCalls === 2`). Mesma economia do [FlowEngine](FlowEngine.md), com o contexto preservado na run.

## Testes

`src/engine/agent/mastraRunner.test.ts` (modelo simulado: suspende, `resetMastra()`, retoma em outro Agent até o rascunho); `src/assistants/nexo/flows/openTicket.test.ts` (ponta a ponta com runner roteirizado, que imita "input original + último payload"); `src/test/scriptedRunner.ts`.
