# PendingAction

Nenhum efeito colateral sem confirmação explícita: tools de escrita e flows produzem um rascunho, e o engine só executa ao receber "Confirmar". Código: `src/engine/actions/pending.ts`, parte de `src/engine/conversation/turn.ts`, executores em `src/assistants/nexo/actions.ts`.

## Estrutura

`PendingAction { id, kind, input, draft, label, extraOptions?, createdAt }` persistida em `conversations.pending_action`. `id` é atribuído pelo engine (`withActionId`) e vira a `idempotencyKey` do executor. `kind` indexa `AssistantConfig.actions`; `input` é o que o executor precisa (pode trazer `flow` snapshot para edição); `draft` é só para exibição (payload `draft`).

## Opções enviadas com o rascunho

`confirm`, `edit:<stepKey>` (extraOptions do flow), opções alternativas da persona (ex.: `criar-um-novo-mesmo-assim`), `cancel`. Texto "sim/confirmar/ok" confirma; "não/cancelar" cancela; outro texto vai ao agent com o rascunho no contexto, e o agent pode usar `confirm-pending-action` / `cancel-pending-action` ou refazer a ação.

## Invariantes

- Tools com `requiresConfirmation` devolvem a `PendingAction` e o modelo recebe `{ status: "awaiting_confirmation", draft }`; nada é gravado.
- Rascunho de complemento/reabertura sempre por `existingTicketDraft` (dados do chamado existente + prazo renovado); flow, tools e executor usam a mesma fonte.
- O executor roda sem LLM (`source: action` no trace) e devolve texto, payload, `afterEffects` (`link-ticket`, `transfer`) e, opcionalmente, um novo `pendingAction` (ex.: criação recusada por duplicado → rascunho de complemento, nova confirmação).
- Confirmar segue o padrão outbox ([ActionQueue](ActionQueue.md)): tirar o rascunho e registrar a ação são atômicos; a execução vem depois. Falha temporária (503) → fica na fila; erro de regra → o rascunho volta com nova chave e as mesmas opções.
- Um novo rascunho substitui o anterior; `take`/`close` do analista descartam.
- `edit:<key>` exige `input.flow`; sem ele, a opção cai no agent.
