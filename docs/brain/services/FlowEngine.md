# FlowEngine

Chat-formulário determinístico: perguntas em ordem, com opções, sem LLM. Código: `src/engine/flows/runner.ts`; flow da Nexo em `src/assistants/nexo/flows/openTicket.ts`.

## Contrato (`FlowDefinition`)

- `steps[]`: `key`, `prompt`, `type` (`text | choice`), `options`, `skipIf(data)`, `validate(value, data)`.
- `onComplete(data, ctx)` → `FlowOutcome { text, payload?, pendingAction?, trace? }`. Pode chamar serviços; aqui também poderia chamar LLM.
- Estado `FlowState { flowId, data, stepIndex, startedAt }` persistido em `conversations.active_flow`: sobrevive a reinício.

## Regras do runner

- Início: pula passos com `skipIf` verdadeiro; se todos pulados, conclui direto.
- Resposta a passo `choice`: aceita `optionId`, o rótulo digitado (case-insensitive) ou o número da opção; inválido repete a pergunta com a lista.
- Passo `text` vazio repete a pergunta; `validate` devolve texto de erro.
- Toda pergunta leva a opção `cancel`; texto "cancelar/desistir" também cancela (`cancelText`).
- `resumeAtStep(flow, data, key)` apaga `data[key]` e reabre naquele passo (usado por "Editar X" do rascunho); passos seguintes já preenchidos são pulados pelo `skipIf`, passos sem `skipIf` (impacto, urgência) são refeitos.
- Enquanto há flow ativo, o turno não chama o agent ([Turn](../functions/Turn.md)).

## Flow `open-ticket`

Passos: `type` → `title` → `description` → `category` → `impact` → `urgency` → `affected` (pulado se impacto = só eu). Os quatro primeiros são pulados quando pré-preenchidos pelo agent. Conclusão: prioridade pela matriz, prazo, duplicidade/reabertura ([ServiceDeskRules](../conventions/ServiceDeskRules.md)), e um `pendingAction` de `create-ticket`, `update-ticket` ou `reopen-ticket` com o `flow` snapshot em `input` (para "Editar"). `data.force_new = "1"` ignora duplicidade.
