# Nexo Assist

Agent de service desk de TI em formato de chat: o funcionário descreve o problema com as próprias palavras e o agent consulta a central de ajuda, consulta/abre/complementa chamados e chama um analista quando precisa. Construído como um **engine de chat reutilizável** (persona-agnóstico) com a persona "Nexo Assist" plugada por configuração.

## Rodar

```bash
npm install
cp .env.example .env.local     # preencha ANTHROPIC_API_KEY e NEXO_AUTH_SECRET
npm run dev                    # http://localhost:3000
```

- `npm test` roda os testes (node:test + tsx, sem rede); `npm run typecheck` checa os tipos; `npm run seed` recria os dados de exemplo.
- Requer Node 22.5+ (usa `node:sqlite`). O banco fica em `./data/nexo.db` e é criado/semeado no primeiro acesso.
- Com Docker: `cp .env.example .env` (preencha `ANTHROPIC_API_KEY` e `NEXO_AUTH_SECRET`) e `docker compose up --build`. O app sobe em http://localhost:3000 (`NEXO_PORT` muda a porta) e o banco fica no volume `nexo-data`. Atrás de um proxy TLS, envie `x-forwarded-proto: https` para o cookie de sessão sair `Secure`.
- Logins de exemplo (qualquer senha): `ana.souza@nexo.com`, `bruno.lima@nexo.com`, `carla.mendes@nexo.com`, `diego.rocha@nexo.com`, `elisa.martins@nexo.com`; analistas `fabio.nunes@nexo.com`, `gabriela.castro@nexo.com`.

## Arquitetura

```
src/engine/        chat genérico: auth, turno, tools com trace, flows, ações pendentes, SSE   (não conhece a Nexo)
src/assistants/nexo persona: instruções, tools, flow de abertura, executores, seed            (conhece as regras do Anexo A)
src/services/      dados sem LLM: funcionários, central de ajuda, chamados (sistema legado simulado), conversas
src/app/api/       camada HTTP fina (zod + erros → status)
docs/brain/        contratos, invariantes e decisões (comece por docs/brain/index.md)
```

Regras de dependência: `engine` nunca importa `assistants/*`; a persona importa `engine` e `services`; `services` não sabe o que é agent. O agent só acessa dados por tools, e as tools recebem o usuário logado pelo `requestContext`, por isso a privacidade dos chamados é garantida no código, não no prompt.

**Por que Mastra + Claude.** Mastra era a preferência do desafio e tem tools tipadas com zod, `requestContext` por requisição e stream com eventos de tool call. Claude Sonnet 5.5 (`@ai-sdk/anthropic`) tem boa aderência a instruções em português e a tool use; as instruções são estáveis e marcadas para cache de prompt. O modelo é configurável por `NEXO_MODEL`.

## Como o agent decide

Cada mensagem do funcionário passa por `src/engine/conversation/turn.ts`, nesta ordem:

1. **Estado da conversa.** `closed` rejeita; limite de 30 mensagens rejeita; com analista envolvido (`waiting_analyst`/`analyst`) a mensagem é gravada e o agent fica em pausa.
2. **Ação pendente (rascunho).** "Confirmar" executa a ação de forma determinística (criar/complementar/reabrir chamado); "Cancelar" descarta; "Editar X" reabre a pergunta X do flow. Texto livre vai ao agent com o rascunho no contexto.
3. **Flow ativo (chat-formulário).** Sem LLM: a próxima pergunta, com opções, ou a conclusão. A abertura de chamado é um flow: tipo, título, descrição, categoria, impacto, urgência e afetados, pulando o que o agent já preencheu.
4. **Agent (LLM).** Recebe as últimas 20 mensagens e um contexto curto (quem é o usuário, data, rascunho pendente). Decide entre as tools: `search-help-center`, `list-my-tickets`, `get-my-ticket`, `start-open-ticket-flow`, `add-ticket-update`, `reopen-ticket`, `transfer-to-analyst`, mais `suggest-quick-replies` e `report-decision`.

Decisões que **não** ficam com o modelo: prioridade (matriz impacto × urgência do Anexo A), prazo (horas/dias úteis), duplicidade e reabertura (similaridade lexical sobre os chamados do próprio funcionário), privacidade (filtro por usuário nas tools), confirmação (qualquer escrita vira rascunho antes), transferência automática de chamado crítico e escalonamento por confiança: na primeira resposta com confiança baixa o engine oferece um analista; se a seguinte também for baixa, transfere sozinho (motivo `low_confidence`), e o caso aparece no console como "Agent pediu ajuda".

## Transparência

Cada resposta do assistente grava um `trace`: as ações executadas com rótulo humano ("consultou seus chamados", "classificou a prioridade: Alta, impede uma pessoa de trabalhar"), a decisão declarada pelo agent via tool obrigatória `report-decision` (o que entendeu, ação, confiança, porquê), modelo, tokens e duração. No SSE os rótulos chegam em tempo real (evento `action`) antes do texto; o detalhe completo chega no evento `trace` e fica persistido na mensagem.

Na interface, os rótulos aparecem acima de cada resposta (como no protótipo) e o botão **"Por quê?"** abre o detalhe: o que o agent entendeu, o que fez, a segurança (alta, média ou baixa) e o porquê, mais cada passo com o resultado e a origem da resposta (IA, formulário guiado ou regra). No console do analista o mesmo painel ("Ver raciocínio") inclui as observações do engine, modelo, tokens e tempo, e já vem aberto quando a segurança foi baixa. A confiança é categórica, não percentual: o modelo não tem calibração que justifique um número.

## Console do analista

`/atendente` (logins `fabio.nunes@nexo.com` e `gabriela.castro@nexo.com`): lista com busca e filtros (Todas, Para você, Com o agent, Minhas), etiqueta de status por conversa ("Transferida · INC-20311", "Agent pediu ajuda", "Agent atendendo"), histórico com o raciocínio do agent, resumo da transferência, assumir (agent pausado), responder, devolver ao agent, encerrar e painel com os chamados do funcionário. Atualiza por polling.

## Como a qualidade das decisões é garantida

- Regras do service desk em código testado (`src/services/tickets/*.test.ts`), não em prompt.
- Efeitos colaterais só por ação confirmada; o executor roda sem LLM.
- Tools nunca lançam para dentro do modelo: erro vira `{ error, message }` e nota no trace. O sistema legado simulado fica indisponível às vezes (`NEXO_TICKETS_OUTAGE_RATE`); há retry com backoff e, se persistir depois que o funcionário confirmou, o pedido vai para uma fila (`action_queue`) e é registrado quando o sistema volta, com o resultado postado na conversa.
- Sem duplicidade em três camadas: o agent indica o chamado relacionado quando reconhece o mesmo problema com outras palavras (o flow confere se é do funcionário); o flow compara por similaridade ao montar o rascunho; e o serviço recompara na transação de gravação, o que cobre rascunhos paralelos e pedidos que esperaram na fila. Cada rascunho tem uma chave de idempotência única no banco: confirmar duas vezes ou reprocessar a fila não grava duas vezes. Testes de ponta a ponta em `src/assistants/nexo/flows/dedup.validation.test.ts`.
- Testes de orquestração com runner roteirizado (sem rede) e teste de integração com modelo Mastra simulado cobrindo tool call + `requestContext`.
- Instruções obrigam `report-decision`; o engine usa a confiança declarada como gatilho de segurança.

## API

Autenticação por cookie httpOnly `nexo_session` ou `Authorization: Bearer <token>` (token HMAC assinado). Contrato completo em [`docs/brain/functions/ChatApi.md`](docs/brain/functions/ChatApi.md) e [`AnalystConsoleApi.md`](docs/brain/functions/AnalystConsoleApi.md).

| Rota | Descrição |
|---|---|
| `POST /api/auth/login` `{email,password}` · `GET /api/auth/me` · `POST /api/auth/logout` | sessão |
| `GET/POST /api/conversations` · `GET /api/conversations/:id` | minhas conversas |
| `POST /api/conversations/:id/messages` `{text}` ou `{optionId}` | turno; com `Accept: text/event-stream` responde SSE |
| `GET /api/conversations/:id/messages?after=<id>` | polling de respostas do analista |
| `GET /api/tickets` · `GET /api/tickets/:id` · `GET /api/help-center?q=` | só os meus chamados; central |
| `GET /api/analyst/conversations?state=&q=` · `GET .../:id` · `POST .../:id/take|messages|return|close` · `GET /api/analyst/employees/:id/tickets` | console do analista |

Roteiro rápido com curl:

```bash
T=$(curl -s localhost:3000/api/auth/login -H 'content-type: application/json' -d '{"email":"ana.souza@nexo.com","password":"x"}' | jq -r .token)
C=$(curl -s -X POST localhost:3000/api/conversations -H "authorization: Bearer $T" | jq -r .id)
curl -N localhost:3000/api/conversations/$C/messages -H "authorization: Bearer $T" -H 'accept: text/event-stream' \
  -H 'content-type: application/json' -d '{"text":"minha vpn dá erro 809"}'
```

## Trade-offs e próximos passos

- **Tipo/categoria sem LLM extra.** O agent pré-preenche o que já sabe; o flow pergunta o resto com opções. Zero custo e previsível, ao preço de uma pergunta a mais quando o agent não tem certeza. Com mais tempo: classificador com modelo rápido (`NEXO_FAST_MODEL`) e confiança, caindo para a pergunta só abaixo de um limiar.
- **Duplicidade sem busca semântica.** A similaridade é lexical (Jaccard sobre tokens) e não pega sinônimos ("PC demorando depois do update" × "Notebook lento após atualização"). Com poucos chamados por funcionário, o próprio agent indica o chamado relacionado e o código confere, sem custo extra. Com a base maior: busca semântica (embeddings dos chamados do funcionário) como camada determinística.
- **Fila em processo.** O worker da fila roda dentro do servidor (`setInterval`); o claim atômico evita trabalho duplo entre instâncias, mas em produção seria um worker dedicado.
- **Polling para o analista.** Simples e funciona em qualquer hospedagem; um canal SSE de assinatura por conversa seria o passo seguinte.
- **Multi-persona.** O engine já isola a persona (`AssistantConfig`) e grava `assistant_id`; falta tabela de personas, chaves de API por integrador e endpoints de administração.
- **Migrações.** Versionadas em código, sem ferramenta externa; suficiente para SQLite.
- **Sem avaliação automática do agent.** Próximo passo: um conjunto de conversas de referência rodando contra o modelo real, com asserções sobre as tools chamadas e o `report-decision`.
