# DecisionTrace

Registro do que o assistente fez e por quê, gravado em `messages.trace` e emitido no SSE. Tipos em `src/engine/types.ts` (`Trace`); construção em `src/engine/tools/wrap.ts` e `src/engine/conversation/turn.ts`.

## Estrutura

- `source`: `agent` (LLM), `flow` (chat-formulário), `action` (executor confirmado), `rule` (engine).
- `actions[]`: uma por tool executada, com `label` humano ("consultou seus chamados"), `status` (`pending | done | error`), `summary`, `input`, `durationMs`. Flows e executores também registram ações sintéticas ("classificou a prioridade", "verificou duplicidade", "criou o chamado X").
- `decision`: `{ understanding, action, confidence: alta|media|baixa, reasoning }`, vinda da tool obrigatória `report-decision` ou montada pelo flow.
- `model`, `usage` (tokens), `durationMs`, `notes[]` (erros de tool, retries, regras aplicadas).

## Invariantes

- Tools internas (`suggest-quick-replies`, `report-decision`, `confirm/cancel-pending-action`) são `hidden`: não geram ação no trace.
- Tools `quiet` (hoje só `search-help-center`) geram ação com `quiet: true`: ficam no trace e no console, mas o chat do funcionário não as lista acima da resposta (consulta de rotina não é informação para ele; o que importa são os artigos citados).
- Uma tool nunca lança para dentro do modelo: erro vira `{ error: code, message }` como resultado, ação com `status: error` e nota.
- Evento SSE `action` é emitido duas vezes por ação (pending e final) com o **mesmo id**.
- Mensagem barrada pela validação de entrada ([InputPolicy](../conventions/InputPolicy.md)): `source: rule`, sem `actions`, nota `entrada sem conteúdo útil (<motivo>): respondida por regra, sem chamar o modelo`. A nota é o ponto de medição (quantas mensagens não foram ao modelo e por quê).
- `confidence: baixa` sem transferência/rascunho/flow → engine acrescenta a opção "Falar com um analista" e registra nota. Se a resposta anterior do assistente também foi `baixa`, o engine transfere sozinho (`transferReason: low_confidence`, resumo com o entendimento e o porquê) e remove as opções: o caso aparece no console como "Agent pediu ajuda".
- A confiança é categórica (`alta|media|baixa`), não percentual: o número do protótipo é ilustrativo e um percentual autodeclarado pelo modelo daria precisão falsa.
- Tool que suspende a run ([HumanInTheLoop](../services/HumanInTheLoop.md)) fica com `status: pending` e `summary: "perguntou: …"`; a mensagem da pergunta pode não ter `decision`. A ação da tool precede as ações sintéticas que ela registra (prioridade, duplicidade). Quando a tool conclui com um rascunho, a decisão sintética do chat-formulário entra no trace se o modelo não chamar `report-decision`.
- O funcionário vê só os rótulos das ações acima da resposta; o detalhe (decisão, passos, notas do engine, modelo, tokens e tempo) é do analista, em "Ver raciocínio". Componente: `src/components/trace/DecisionDetails.tsx` (a variante não técnica continua disponível, hoje sem uso no chat).
