# PendingAction

Nenhum efeito colateral sem confirmação explícita: tools de escrita e flows produzem um rascunho, e o engine só executa ao receber "Confirmar". Código: `src/engine/actions/pending.ts`, parte de `src/engine/conversation/turn.ts`, executores em `src/assistants/nexo/actions.ts`.

## Estrutura

`PendingAction { kind, input, draft, label, extraOptions?, createdAt }` persistida em `conversations.pending_action`. `kind` indexa `AssistantConfig.actions`; `input` é o que o executor precisa (pode trazer `flow` snapshot para edição); `draft` é só para exibição (payload `draft`).

## Opções enviadas com o rascunho

`confirm`, `edit:<stepKey>` (extraOptions do flow), opções alternativas da persona (ex.: `criar-um-novo-mesmo-assim`), `cancel`. Texto "sim/confirmar/ok" confirma; "não/cancelar" cancela; outro texto vai ao agent com o rascunho no contexto, e o agent pode usar `confirm-pending-action` / `cancel-pending-action` ou refazer a ação.

## Invariantes

- Tools com `requiresConfirmation` devolvem a `PendingAction` e o modelo recebe `{ status: "awaiting_confirmation", draft }`; nada é gravado. Tools que concluem um chat-formulário ([HumanInTheLoop](HumanInTheLoop.md)) devolvem `{ outcome }` e caem no mesmo contrato (com `summary` = texto do resultado).
- O executor roda sem LLM (`source: action` no trace) e devolve texto, payload e `afterEffects` (`link-ticket`, `transfer`).
- Falha do executor (ex.: `TICKET_SERVICE_UNAVAILABLE` após retries) **mantém** o rascunho e responde com as mesmas opções para nova tentativa.
- Um novo rascunho substitui o anterior; `take`/`close` do analista descartam.
- `edit:<key>` exige `input.flow`; sem ele, a opção cai no agent.
