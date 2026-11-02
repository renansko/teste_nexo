# Nexo Assist

> **Resumo**: agent de service desk de TI em chat. O funcionário descreve o problema; o agent consulta a central de ajuda, consulta/abre/complementa chamados e chama um analista quando precisa. O chat é um **engine reutilizável** (não conhece a Nexo) com a persona "Nexo Assist" plugada por configuração.

## 1. Rodar

```bash
cp .env.example .env.local   # preencha OPENAI_API_KEY e NEXO_AUTH_SECRET
npm install && npm run dev   # http://localhost:3000 (Node 22.5+; SQLite criado e semeado no 1º acesso em ./data)
```

```mermaid
flowchart LR
    Env[".env.local com as 2 chaves"] --> Dev["npm run dev ou docker compose up --build"]
    Dev --> Func["/ funcionário: ana.souza@nexo.com"]
    Dev --> Ana["/atendente analista: fabio.nunes@nexo.com"]
    Func --> Chat["chat com cards, rascunhos e passos do agent"]
    Ana --> Console["console: filas, assumir, responder, resolver"]
```

- Qualquer senha. Outros funcionários: `bruno.lima`, `carla.mendes`, `diego.rocha`, `elisa.martins` (`@nexo.com`); outra analista: `gabriela.castro`.
- Docker: `cp .env.example .env`, preencha as chaves, `docker compose up --build` (volume `nexo-data` guarda o banco).
- `npm test` (sem rede) · `npm run typecheck` · `npm run seed` recria os dados de exemplo.

**Por onde olhar.** Em um minuto: abra um chamado como funcionário e veja o raciocínio em "Ver raciocínio" no console do analista. No código, três pontos: a abertura de chamado pausa a run do agent e retoma com a resposta do funcionário (seção 5); a confirmação vira outbox com chave de idempotência, então o legado pode cair sem duplicar chamado (seção 7); o trace de decisão fica com o analista, o funcionário vê só as ações (seção 8).

**Deploy.** Sem banco externo: o SQLite roda no container. Qualquer PaaS que construa um `Dockerfile` serve, com `OPENAI_API_KEY`, `NEXO_AUTH_SECRET` (16+ caracteres), `NODE_ENV=production`, `NEXO_DB_PATH=/app/data/nexo.db`, porta `3000`, health check em `/entrar`. No **Render Free** (New Web Service → repositório → Docker) o serviço dorme após 15 min e o disco é efêmero: a cada hibernação ou deploy o banco volta ao seed. Para persistir de graça, uma VM Always Free da Oracle com este `docker compose` e um proxy TLS (`x-forwarded-proto: https` deixa o cookie `Secure`). Defina limite de gasto na OpenAI; não há rate limit por IP.

## 2. Visão geral

```mermaid
graph LR
    subgraph UI["Front (Next.js)"]
        Chat["Chat do funcionário (SSE)"]
        Console["Console do analista (polling)"]
    end
    subgraph Engine["src/engine — genérico, não conhece a Nexo"]
        Turn["Turno: estado → run pausada → rascunho → flow → validação → agent"]
        Tools["Tools com trace, HITL, outbox"]
    end
    subgraph Persona["src/assistants/nexo — regras do Anexo A"]
        Instr["Instruções + tools + executores + hooks"]
    end
    subgraph Services["src/services — sem LLM"]
        Tickets["Chamados (legado simulado, cai às vezes)"]
        Help["Central: artigos + soluções de analistas"]
        Conv["Conversas"]
    end
    LLM["LLM via model router do Mastra (NEXO_MODEL)"]
    Chat --> Turn
    Console --> Conv
    Turn --> Tools --> Instr
    Turn --> LLM
    Instr --> Tickets & Help & Conv
    Services --> DB[("SQLite nexo.db + mastra.db")]
```

`engine` nunca importa `assistants/*`; a persona importa `engine` e `services`; `services` não sabe o que é agent. O agent só vê dados por tools, e as tools recebem o usuário logado pelo `requestContext`: privacidade garantida no código, não no prompt. Contratos e invariantes em [docs/brain/index.md](docs/brain/index.md).

## 3. Como o agent decide

Cada mensagem passa por `src/engine/conversation/turn.ts` nesta ordem ([Turn](docs/brain/functions/Turn.md)):

```mermaid
flowchart TD
    Msg([Mensagem do funcionário]) --> Estado{Conversa com analista, encerrada ou no limite?}
    Estado -- sim --> Grava["Grava e não responde (ou 409)"]
    Estado -- não --> Run{Run pausada numa pergunta?}
    Run -- sim --> Resume["Retoma a run de onde parou (resumeStream)"]
    Run -- não --> Rasc{Rascunho pendente?}
    Rasc -- Confirmar --> Outbox["Executa sem LLM via outbox"]
    Rasc -- Editar X --> Flow["Chat-formulário reabre a pergunta X"]
    Rasc -- "texto livre ou sem rascunho" --> Val{"Tem conteúdo útil? (regex, sem LLM)"}
    Val -- "não: 'A', '???', 'aaaa', '123'" --> Regra["Responde por regra com atalhos"]
    Val -- sim --> Agent["Agent: 20 msgs + contexto curto + tools"]
    Agent --> Dec["report-decision obrigatória: entendeu, fez, segurança, por quê"]
    Dec --> Baixa{Segurança baixa?}
    Baixa -- 1ª vez --> Oferece["Oferece 'Falar com um analista'"]
    Baixa -- 2ª seguida --> Transfere["Transfere sozinho ('Agent pediu ajuda')"]
```

Tools: `search-help-center`, `cite-articles`, `suggest-help-article`, `list-my-tickets`, `get-my-ticket`, `open-ticket`, `add-ticket-update`, `reopen-ticket`, `transfer-to-analyst`, mais `suggest-quick-replies` e `report-decision`.

O modelo só entra na última caixa. Tudo antes dela é regra: estado, run pausada, rascunho e a validação da mensagem. A seção seguinte mostra onde isso corta custo.

## 4. Decisões de IA e custo

O PRD coloca aqui o centro do desafio, e foi onde o esforço se concentrou. Princípio: **a IA decide só o que exige entender linguagem** (qual é o problema, qual artigo se aplica, como conduzir). Tudo que é fato, regra do Anexo A ou efeito colateral é código determinístico, testado e com custo zero de modelo. Nos pontos mistos a IA propõe e a regra confere. Resultado: menos chamadas ao modelo e comportamento previsível justamente onde há efeito colateral.

```mermaid
flowchart LR
    M([Mensagem]) --> G{"inputGuard: regex e contagem<br/>'A', '???', 'aaaa', '123'"}
    G -- barrada --> R0["Resposta por regra + atalhos<br/>0 chamadas"]
    G -- ok --> P{"Resposta a pergunta, rascunho<br/>ou clique em opção?"}
    P -- sim --> R1["Só a tool ou o executor roda<br/>0 chamadas"]
    P -- não --> LLM["1 run do agent: tools + report-decision<br/>instruções estáveis em cache, janela de 20 msgs, maxSteps 6"]
    LLM --> D["Prioridade, prazo, duplicidade, escopo, privacidade:<br/>regra confere o que a IA propôs"]
```

Onde o custo foi cortado, do mais frequente ao mais raro:

- **Validação da entrada por regex** ([InputPolicy](docs/brain/conventions/InputPolicy.md)): caractere solto, só símbolos ou emoji, repetição e só números recebem resposta por regra com "Abrir um chamado" / "Falar com um analista". Motivação medida no painel do provedor: uma mensagem "A" custava duas chamadas (texto + `report-decision`) para responder "não entendi". Conservadora: "oi", "ok", "vpn", "INC-20311" passam; palavras reais sem sentido vão ao modelo. O composer roda a mesma função e nem envia. A política é da persona (`inputPolicy`), não constante do código.
- **Perguntas do chamado sem LLM**: impacto, urgência, afetados e "isso resolveu?" pausam a run; a resposta reexecuta só a tool. Um chamado completo custa uma run para extrair e uma para concluir, não uma por pergunta.
- **Confirmar, cancelar, editar e cliques em opção** são interpretados por regra (opção clicada ou regex de texto curto); só texto ambíguo diante de um rascunho vai ao modelo.
- **Prioridade, prazo, duplicidade, reabertura, escopo e privacidade** são código (`services/tickets/*`, `scope.ts`): o modelo nunca arbitra o Anexo A.
- **Tipo e categoria sem classificador extra**: o agent pré-preenche o que o funcionário já disse; faltou, a tool pergunta com opções.
- **Busca lexical** na central e nas soluções de analistas; **resumo do assistente** no console montado das mensagens já gravadas. Nenhuma chamada nova ao modelo.
- **Limites**: 30 mensagens por conversa, janela de 20, `maxSteps` 6, instruções estáveis (nada de data ou usuário nelas) para o cache de prompt do provedor.

| Ponto | Quem decide | Onde | Por quê |
|---|---|---|---|
| Mensagem tem conteúdo útil? | Regra (regex/contagem; política por persona) | `engine/conversation/inputGuard.ts`, `turn.ts` | Caractere solto ou símbolos custavam duas chamadas ao modelo para responder "não entendi". |
| Conversa aceita mensagem? (encerrada, limite de 30, analista na conversa) | Regra | `turn.ts` | Estado é fato, não interpretação. |
| "Confirmar", "cancelar", "editar X" diante do rascunho; cancelar uma pergunta | Regra (opção clicada ou regex de texto curto); texto ambíguo vai à IA com o rascunho no contexto | `engine/actions/pending.ts`, `engine/flows/runner.ts` | Confirmação de efeito colateral não pode depender de interpretação. |
| Quais perguntas faltam para o chamado e em que ordem | Regra (passos do chat-formulário; a tool pergunta pausando a run) | `assistants/nexo/flows/openTicket.ts`, `tools/ticketActions.ts` | Responder às perguntas reexecuta só a tool: zero chamadas ao modelo. |
| Tipo (INC/REQ) e categoria | IA pré-preenche quando o funcionário já disse; regra pergunta com opções quando falta | `tools/ticketActions.ts` | Sem LLM extra; uma pergunta a mais quando há dúvida. |
| Prioridade e prazo | Regra (matriz impacto × urgência do Anexo A; horas/dias úteis) | `services/tickets/priority.ts`, `sla.ts` | Regra de negócio auditável; o modelo não arbitra prioridade. |
| É duplicado ou reabertura? | IA indica o chamado relacionado quando reconhece paráfrase; regra confere em três camadas (flow, rascunho, transação) | `services/tickets/dedup.ts`, `ticketService.ts` | A IA cobre sinônimos a custo zero; a regra impede gravação dupla mesmo em paralelo. |
| Assunto é de TI? | Instrução ao modelo + guarda lexical conservadora na `open-ticket` | `assistants/nexo/scope.ts` | Sinal claro de RH/financeiro/facilities nunca vira chamado; na dúvida o modelo decide. |
| Quais chamados o funcionário pode ver | Regra (filtro por usuário em toda tool) | `tools/tickets.ts`, `services/tickets` | Privacidade no código, não no prompt. |
| Criar, complementar ou reabrir chamado | Regra: só após "Confirmar", pelo outbox com chave de idempotência | `turn.ts`, `engine/actions/queue.ts` | Nenhum efeito colateral depende de o modelo "prometer". |
| Transferir para analista | IA chama a tool (pedido, crítico, vencido, insegurança); regra transfere sozinha ao criar chamado crítico e após duas respostas seguidas com confiança baixa | `tools/transfer.ts`, `actions.ts`, `turn.ts` | O modelo reconhece o caso; o engine garante os casos do Anexo A sem depender dele. |
| "Isso resolveu?" | Regra para clique e respostas claras; IA lê o texto quando ambíguo (`unclear`) | `tools/helpCenter.ts` | Métrica de resolução sem gastar modelo nos casos óbvios. |
| Buscar na central e nas soluções de analistas | Regra (busca lexical: título > tags > corpo) | `services/helpCenter/helpCenterService.ts` | Determinística e suficiente para dezenas de itens; embeddings quando a base crescer. |
| Qual artigo se aplica e o que dizer ao funcionário | IA | `instructions.ts`, tools `suggest-help-article` / `cite-articles` | É o trabalho do modelo: entender o problema e conduzir. |
| Entender o problema, pedir detalhes, redigir a resposta | IA | `instructions.ts` | Idem; as instruções limitam o tom e proíbem inventar status e procedimentos. |
| Confiança da resposta | IA declara (`report-decision`, categórica); regra usa como gatilho de segurança | `engine/tools/wrap.ts`, `turn.ts` | Autodeclaração não é calibrada, por isso vira categoria e gatilho, não percentual. |

**Em escala.** A validação é configuração da persona (`AssistantConfig.inputPolicy`: mínimo de caracteres, só números ou não, classe de caracteres, dica, atalhos) e o cliente recebe a mesma política em `conversation.inputPolicy`. Como produto vira um registro por tenant com tela de administração (a mesma tabela de personas prevista em multi-persona), e as notas do trace (`entrada sem conteúdo útil (<motivo>)`) medem quantas mensagens foram barradas e por quê, para ajustar a política sem tocar em código.

## 5. Fluxo ponta a ponta: resolver ou abrir chamado

```mermaid
sequenceDiagram
    autonumber
    actor F as Funcionário
    participant E as Engine (turno)
    participant A as Agent (LLM)
    participant T as Tool open-ticket / suggest-help-article
    participant L as Legado (chamados)
    F->>E: "minha VPN dá erro 809"
    E->>A: run com tools
    A->>T: search-help-center → suggest-help-article(kb-vpn-809)
    T-->>F: card do artigo + "isso resolveu?" (run pausada, snapshot em mastra.db)
    F->>E: "Não resolveu"
    E->>T: retoma a run (só a tool roda, zero LLM)
    T->>A: feedback not_resolved → próximo passo
    A->>T: open-ticket(título, descrição, tipo, categoria extraídos)
    T-->>F: pergunta impacto e urgência com opções (pausa de novo)
    F->>E: responde
    E->>T: retoma: prioridade, prazo, duplicidade (relatedTicketId conferido)
    T-->>F: rascunho + Confirmar / Editar X / Cancelar
    F->>E: Confirmar
    E->>E: 1 transação: tira o rascunho, grava action_queue
    E->>L: createTicket(idempotencyKey) com retry
    L-->>F: "Chamado INC-20412 aberto" (crítico → transfere ao analista)
```

Perguntas intermediárias não chamam o LLM. "Resolveu" encerra sem chamado e grava o acerto do artigo ([HelpFeedback](docs/brain/entities/HelpFeedback.md)); a solução que o analista escreve ao resolver vira memória pesquisável, só título, categoria e solução ([ResolutionMemory](docs/brain/entities/ResolutionMemory.md)). Detalhes: [HumanInTheLoop](docs/brain/services/HumanInTheLoop.md), [PendingAction](docs/brain/services/PendingAction.md).

## 6. Estados e dados

```mermaid
stateDiagram-v2
    [*] --> agent
    agent --> waiting_analyst : transfer-to-analyst, chamado crítico, 2ª confiança baixa
    waiting_analyst --> analyst : analista assume (agent pausado)
    agent --> analyst : analista assume
    analyst --> agent : devolve
    waiting_analyst --> agent : devolve sem assumir
    agent --> closed : encerra
    analyst --> closed : encerra
```

```mermaid
erDiagram
    conversations ||--o{ messages : "role user/agent/analyst/system"
    conversations ||--o| tickets : "ticket_id vinculado"
    conversations ||--o{ action_queue : "ação confirmada"
    tickets ||--o{ ticket_updates : "complementos"
    tickets ||--o| resolution_memories : "solução do analista"
    messages ||--o{ help_feedback : "isso resolveu?"
    conversations {
        text state
        text pending_action
        text suspended_run
        int user_message_count
    }
    tickets {
        text status
        text priority
        text due_at
        text idempotency_key
    }
    action_queue {
        text status
        text idempotency_key
        int attempts
    }
```

Só o engine e o analista mudam o estado; só em `agent` o assistente responde. Uma conversa tem no máximo um entre flow ativo, rascunho e run pausada. Migrações versionadas em código ([Persistence](docs/brain/conventions/Persistence.md)).

## 7. Resiliência

```mermaid
flowchart TD
    C([Confirmar]) --> Tx["Transação: rascunho sai, action_queue = processing"]
    Tx --> Exec["Executor sem LLM, idempotencyKey = id do rascunho"]
    Exec --> R{Resultado}
    R -- ok --> Done["done: resposta na conversa, link-ticket, crítico transfere"]
    R -- 503 legado fora --> Q["queued com backoff; worker a cada 5 s; 'aviso quando voltar'"]
    R -- duplicado apareceu --> Dup["Vira rascunho de complemento (nova confirmação)"]
    R -- erro de regra --> Fail["failed: rascunho volta com nova chave"]
    Q --> Exec
    Crash["Processo caiu em processing > 2 min"] --> Q
```

- Chave de idempotência única em `tickets`/`ticket_updates`: reexecutar nunca grava duas vezes ([ActionQueue](docs/brain/services/ActionQueue.md)).
- Duplicidade em três camadas: o agent indica o chamado relacionado, o rascunho compara por similaridade, o serviço recompara na transação de gravação.
- Tools nunca lançam para dentro do modelo: erro vira `{ error, message }` e nota no trace. Legado fora (`NEXO_TICKETS_OUTAGE_RATE`) tem retry com backoff ([LegacyOutage](docs/brain/conventions/LegacyOutage.md)).
- Testes: regras em `src/services/tickets/*.test.ts`, runner roteirizado sem rede, integração com modelo Mastra simulado, ponta a ponta de duplicidade em `src/assistants/nexo/flows/dedup.validation.test.ts`.

## 8. Transparência

Cada resposta grava um `trace` ([DecisionTrace](docs/brain/entities/DecisionTrace.md)): ações com rótulo humano ("consultou seus chamados", "classificou a prioridade: Alta"), a decisão de `report-decision` (o que entendeu, o que fez, segurança alta/média/baixa, por quê), modelo, tokens e duração. No SSE os rótulos chegam antes do texto. Para o funcionário ficam acima da resposta ("consultou seus chamados", "montou o chamado"), sem painel técnico; no console do analista, **"Ver raciocínio"** abre o detalhe completo (decisão, passos, notas do engine, modelo, tokens) e já vem aberto quando a segurança foi baixa. A confiança é categórica porque o modelo não tem calibração que justifique um percentual.

## 9. API

Cookie httpOnly `nexo_session` ou `Authorization: Bearer <token>` (HMAC). Contratos: [ChatApi](docs/brain/functions/ChatApi.md), [AnalystConsoleApi](docs/brain/functions/AnalystConsoleApi.md).

| Rota | |
|---|---|
| `POST /api/auth/login` `{email,password}` · `GET /api/auth/me` · `POST /api/auth/logout` | sessão |
| `GET/POST /api/conversations` · `GET /api/conversations/:id` · `GET .../:id/messages?after=` | minhas conversas e polling |
| `POST /api/conversations/:id/messages` `{text}` ou `{optionId}` | turno; `Accept: text/event-stream` responde SSE |
| `GET /api/tickets` · `GET /api/tickets/:id` · `GET /api/help-center?q=` | só os meus chamados; central |
| `GET /api/analyst/conversations?state=&q=` · `.../:id` · `POST .../:id/take\|messages\|return\|close` · `POST /api/analyst/tickets/:id/resolve` | console |

```bash
T=$(curl -s localhost:3000/api/auth/login -H 'content-type: application/json' -d '{"email":"ana.souza@nexo.com","password":"x"}' | jq -r .token)
C=$(curl -s -X POST localhost:3000/api/conversations -H "authorization: Bearer $T" | jq -r .id)
curl -N localhost:3000/api/conversations/$C/messages -H "authorization: Bearer $T" -H 'accept: text/event-stream' -H 'content-type: application/json' -d '{"text":"minha vpn dá erro 809"}'
```

## 10. Decisões de arquitetura e trade-offs

| Decisão | Alternativa rejeitada | Por quê |
|---|---|---|
| **Mastra + model router** (`NEXO_MODEL=openai/gpt-6-luna`) | SDK do provedor no projeto | tools tipadas com zod, `requestContext`, stream de tool calls, suspend/resume; trocar de provedor é mudar uma string; instruções estáveis entram no cache de prompt |
| **Human-in-the-loop dentro da run** | chat-formulário fora do agent | o modelo retoma com a resposta no contexto; perguntas intermediárias custam zero LLM; depende de `__registerMastra` (API interna), coberto por teste |
| **Tipo/categoria sem LLM extra** | classificador por mensagem | o agent pré-preenche o que extraiu e a tool pergunta o resto com opções; previsível, ao preço de uma pergunta a mais |
| **Busca e duplicidade lexicais** | RAG / embeddings | determinístico e suficiente para dezenas de itens; sinônimos ficam com o `relatedTicketId` que o agent indica e o código confere; embeddings entram trocando só `searchKnowledge` |
| **Outbox em SQLite, worker no processo** | executar na hora e torcer | confirmação nunca se perde; em produção o worker seria dedicado e a presença "digitando…" iria para um store compartilhado |
| **Polling no console** | SSE por conversa | funciona em qualquer hospedagem; SSE é o passo seguinte |
| **Confiança categórica** | percentual | o modelo não é calibrado; um número daria precisão falsa |
| **Validação de entrada por regex** | classificador por mensagem | custo zero e sem falso positivo em mensagens curtas legítimas ("oi", "vpn"); palavras reais sem sentido ainda vão ao modelo, que pede detalhes (seção 4) |

**O que ficou de fora e por quê.** Guardrails por classificador com confiança (`NEXO_FAST_MODEL`, `inputProcessors` do Mastra) para escopo, INC/REQ e texto sem sentido que o regex não pega: o regex cobre os casos medidos e um classificador erraria em mensagens curtas legítimas, então ficou como próximo passo. Persistência no deploy gratuito: o disco do Render Free é efêmero (seção 1). Também não feitos: promover memória recorrente a artigo da FAQ; multi-persona (tabela de personas, chaves por integrador); avaliação automática com conversas de referência contra o modelo real. As decisões e invariantes deste README vivem em [docs/brain](docs/brain/index.md), mantido junto com o código a cada mudança.
