# Requirements

Resumo do PRD "Desafio Técnico: Nexo Assist, o agent do service desk de TI" (Beyond the Bytes). O PDF original é escaneado; o texto foi transcrito manualmente.

## Objetivo e métricas

Funcionário resolve dúvidas no chat, abre chamados completos (tipo, categoria, prioridade, sem duplicidade), é encaminhado ao analista na hora certa com contexto, e consegue ver o que o agent fez e por quê (transparência é o critério mais importante).

"Resolução sem fila" é medida: cada procedimento sugerido pelo agent termina em "isso resolveu?" e o resultado fica em [HelpFeedback](../entities/HelpFeedback.md) (métrica por artigo em `GET /api/analyst/help-center/metrics`). A central de ajuda também aprende: a solução que o analista escreve ao resolver um chamado vira [ResolutionMemory](../entities/ResolutionMemory.md), pesquisável pelo agent.

## Histórias

Funcionário: tirar dúvida sem chamado; saber status de um chamado sem lembrar o número e se está atrasado; complementar chamado; abrir chamado conversando, conferindo antes; falar com analista quando preferir ou se for grave; voltar outro dia e continuar.
Analista: receber chamados completos; ver conversas que precisam dele (inclusive baixa confiança); assumir (agent pausado), devolver ou encerrar.

## Requisitos técnicos

TypeScript estrito; Mastra; qualquer LLM com justificativa; UI pelo protótipo (Anexo C); serviço de chamados simulado separado do agent, que fica indisponível às vezes; persistência de tudo entre reinícios; execução local com poucos comandos + `.env.example`; limite de 30 mensagens por sessão; login com e-mail corporativo e qualquer senha. Avaliação: qualidade das decisões, condução, transparência, interface, arquitetura/boas práticas, README, deploy (bônus).

Regras do service desk: [ServiceDeskRules](../conventions/ServiceDeskRules.md). Dados de exemplo: `src/assistants/nexo/seed.ts`.

## Validação contra o PRD (2026-11-01)

Todos os itens obrigatórios ("O que construir" 1–7, requisitos técnicos, Anexos A e B) têm código e teste; ver [ServiceDeskRules](../conventions/ServiceDeskRules.md), [Turn](../functions/Turn.md), [FrontendUI](../conventions/FrontendUI.md), [AnalystConsoleApi](../functions/AnalystConsoleApi.md). Escopo só TI deixou de ser só prompt: guarda `detectOutOfScope` em `open-ticket`.

## Pendências

- Anexo C (protótipo Pencil `nexo.pen`): todas as telas implementadas, inclusive o console do analista. O detalhe da decisão (item 7 do PRD) não está desenhado no protótipo; formato escolhido: painel expansível nos passos ([DecisionTrace](../entities/DecisionTrace.md)). Larguras menores conferidas com screenshots (800 e 420 px) em 2026-11-01 ([FrontendUI](../conventions/FrontendUI.md)).
- "Transferir chamados" (item 4 do PRD): resolvido pelos ganchos da persona — transferir a conversa põe o chamado vinculado em `aguardando_analista` e assumir o leva a `em_atendimento` ([Ticket](../entities/Ticket.md)).
- Deploy (diferencial): roteiro no [README](../../../README.md) (Koyeb ou Hugging Face Spaces, planos gratuitos); a publicação depende da conta do autor. Limitação do plano gratuito: disco efêmero, o banco é recriado a cada reinício.
- Escopo: a guarda é lexical e conservadora; classificador com confiança fica como próximo passo ([NexoAssistant](../services/NexoAssistant.md)).
