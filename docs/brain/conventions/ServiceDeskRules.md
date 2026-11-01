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

## Outras regras

- Transferência: pedido do funcionário, crítico, vencido, baixa confiança (`transfer-to-analyst`); crítico criado → transferência automática.
- Privacidade: 404 para chamado de outro funcionário.
- Escopo só TI: regra de prompt (sem tool); fora de escopo o agent orienta e não abre chamado.
- Limite de 30 mensagens do funcionário por conversa (`NEXO_MESSAGE_LIMIT`).
