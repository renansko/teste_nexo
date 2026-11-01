# Requirements

Resumo do PRD "Desafio Técnico: Nexo Assist, o agent do service desk de TI" (Beyond the Bytes). O PDF original é escaneado; o texto foi transcrito manualmente.

## Objetivo e métricas

Funcionário resolve dúvidas no chat, abre chamados completos (tipo, categoria, prioridade, sem duplicidade), é encaminhado ao analista na hora certa com contexto, e consegue ver o que o agent fez e por quê (transparência é o critério mais importante).

## Histórias

Funcionário: tirar dúvida sem chamado; saber status de um chamado sem lembrar o número e se está atrasado; complementar chamado; abrir chamado conversando, conferindo antes; falar com analista quando preferir ou se for grave; voltar outro dia e continuar.
Analista: receber chamados completos; ver conversas que precisam dele (inclusive baixa confiança); assumir (agent pausado), devolver ou encerrar.

## Requisitos técnicos

TypeScript estrito; Mastra; qualquer LLM com justificativa; UI pelo protótipo (Anexo C); serviço de chamados simulado separado do agent, que fica indisponível às vezes; persistência de tudo entre reinícios; execução local com poucos comandos + `.env.example`; limite de 30 mensagens por sessão; login com e-mail corporativo e qualquer senha. Avaliação: qualidade das decisões, condução, transparência, interface, arquitetura/boas práticas, README, deploy (bônus).

Regras do service desk: [ServiceDeskRules](../conventions/ServiceDeskRules.md). Dados de exemplo: `src/assistants/nexo/seed.ts`.

## Pendências

- Anexo C (protótipo Pencil `nexo.pen`): todas as telas implementadas, inclusive o console do analista ([FrontendUI](../conventions/FrontendUI.md), [AnalystConsoleApi](../functions/AnalystConsoleApi.md)). O detalhe da decisão (item 7 do PRD) não está desenhado no protótipo; formato escolhido: painel expansível nos passos ([DecisionTrace](../entities/DecisionTrace.md)).
- Deploy (diferencial) não feito.
