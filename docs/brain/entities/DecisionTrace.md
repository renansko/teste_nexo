# DecisionTrace

Registro do que o assistente fez e por quê, gravado em `messages.trace` e emitido no SSE. Tipos em `src/engine/types.ts` (`Trace`); construção em `src/engine/tools/wrap.ts` e `src/engine/conversation/turn.ts`.

## Estrutura

- `source`: `agent` (LLM), `flow` (chat-formulário), `action` (executor confirmado), `rule` (engine).
- `actions[]`: uma por tool executada, com `label` humano ("consultou seus chamados"), `status` (`pending | done | error`), `summary`, `input`, `durationMs`. Flows e executores também registram ações sintéticas ("classificou a prioridade", "verificou duplicidade", "criou o chamado X").
- `decision`: `{ understanding, action, confidence: alta|media|baixa, reasoning }`, vinda da tool obrigatória `report-decision` ou montada pelo flow.
- `model`, `usage` (tokens), `durationMs`, `notes[]` (erros de tool, retries, regras aplicadas).

## Invariantes

- Tools internas (`suggest-quick-replies`, `report-decision`, `confirm/cancel-pending-action`) são `hidden`: não geram ação no trace.
- Uma tool nunca lança para dentro do modelo: erro vira `{ error: code, message }` como resultado, ação com `status: error` e nota.
- Evento SSE `action` é emitido duas vezes por ação (pending e final) com o **mesmo id**.
- `confidence: baixa` sem transferência/rascunho/flow → engine acrescenta a opção "Falar com um analista" e registra nota.
- O trace fica visível ao funcionário (detalhe da resposta) e ao analista (console).
