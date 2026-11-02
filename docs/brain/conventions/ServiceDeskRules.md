# ServiceDeskRules

Anexo A do PRD em código. Código: `src/services/tickets/priority.ts`, `sla.ts`, `dedup.ts`; testes `rules.test.ts`, `sla.test.ts`.

## Prioridade (matriz impacto × urgência)

| urgência \ impacto | só eu | equipe / empresa |
|---|---|---|
| parado, não consigo trabalhar | Alta | **Crítica** |
| compromisso hoje | Alta | Alta |
| atrapalha, há alternativa | Média | Média |
| sem urgência | Baixa | Baixa |

`priorityFor` devolve também o motivo em texto (vai ao trace e ao rascunho).

## Prazos

Crítica 1 h corrida; Alta 4 h úteis; Média 3 dias úteis; Baixa 5 dias úteis. Horário útil seg–sex 08:00–18:00 no fuso `NEXO_BUSINESS_TZ_OFFSET_MINUTES` (padrão Brasília). Fora do expediente o relógio começa no próximo início de expediente. O prazo vale para a primeira resposta e é **renovado a cada atualização**; vencido = `now > dueAt` em status vivo.

## Duplicidade e reabertura

- Candidatos: só chamados do próprio funcionário. Similaridade Jaccard de tokens (sem acentos/stopwords) sobre título+descrição, +0.1 se mesma categoria; limiar 0.25.
- Aberto parecido → `duplicate` (propor complemento). Resolvido há ≤ 7 dias parecido → `reopenable` (propor reabrir). Mais antigo → ignorado.
- Reabrir fora da janela → `REOPEN_NOT_ALLOWED`.
- Três camadas: (1) o agent indica `relatedTicketId` quando reconhece o mesmo problema com outras palavras, e o flow confere se é do funcionário e se está aberto/reabrível; (2) o flow compara por similaridade ao montar o rascunho; (3) o serviço recompara ao gravar, na transação ([TicketService](../services/TicketService.md)). A (3) pega rascunhos paralelos e rascunhos montados com o sistema fora.
- Trade-off: similaridade lexical não pega sinônimos ("PC"/"notebook"); a camada (1) cobre isso com custo zero extra. Busca semântica (embeddings) fica para quando a base crescer.
- Testes de ponta a ponta: `src/assistants/nexo/flows/dedup.validation.test.ts`.

## Outras regras

- Transferência: pedido do funcionário, crítico, vencido, baixa confiança (`transfer-to-analyst`); crítico criado → transferência automática; duas respostas seguidas com confiança baixa → transferência automática pelo engine ([DecisionTrace](../entities/DecisionTrace.md)).
- Privacidade: 404 para chamado de outro funcionário.
- Escopo só TI, em duas camadas: instrução (o agent orienta e não abre chamado) e guarda determinística em `open-ticket` (`src/assistants/nexo/scope.ts`, `detectOutOfScope`): sinal forte de RH/financeiro/facilities sem nenhum sinal de TI → `{ refused: "OUT_OF_SCOPE" }`, nada é perguntado nem gravado, e a ação aparece no trace como "recusou chamado fora do escopo de TI". Conservadora: qualquer sinal de TI prevalece; na dúvida deixa passar. Testes: `scope.test.ts`, `flows/openTicket.test.ts`. Próximo passo: classificador com confiança (`NEXO_FAST_MODEL`).
- Limite de 30 mensagens do funcionário por conversa (`NEXO_MESSAGE_LIMIT`).
