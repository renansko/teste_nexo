# FrontendUI

Front em Next (App Router) seguindo o protótipo do Anexo C (arquivo Pencil `nexo.pen`, fora do repositório). Código: `src/app/(cliente)/`, `src/app/entrar/`, `src/app/atendente/`, `src/components/`, `src/lib/api.ts`.

## Rotas e papéis

| Rota | Tela do protótipo | Papel |
|---|---|---|
| `/entrar` | Identificação | público |
| `/atendimento` | Chat — Novo chamado / Consulta e transferência | `employee` |
| `/perfil` | Cliente — Meu perfil | `employee` |
| `/atendente` | Atendente — Conversas / Atendimento assumido | `analyst` |

`SessionProvider` chama `GET /api/auth/me`; sem sessão manda para `/entrar`, papel errado manda para a home do papel (`HOME_BY_ROLE`). A sessão é o cookie httpOnly `nexo_session` do backend (`AuthSession`, página a criar pelo back); o front nunca guarda token.

## Invariantes

- `src/lib/api.ts` é o único arquivo que conhece URLs e formatos HTTP. Mudou o contrato (`ChatApi`, página canônica a criar pelo back) → ajustar só ali.
- Tokens visuais (cores, fontes Schibsted Grotesk e Newsreader) vêm das variáveis do `.pen` e vivem em `src/app/globals.css`. Não usar cor solta nos componentes.
- Turno do agent chega por SSE: eventos `action` viram os passos acima do balão ("consultou seus chamados"), menos os `quiet` (busca na central), que só aparecem no "Por quê?" e no console; `text.delta` é o texto parcial. Passo `pending` só gira no turno em andamento; em mensagem gravada ele é uma tool que parou para perguntar ([HumanInTheLoop](../services/HumanInTheLoop.md)) e recebe ícone estático de pergunta. Um turno pode trazer várias mensagens (cada uma com `message.start`/`message.end`); erros de domínio vêm como evento `error` dentro do stream. No fim o front recarrega a conversa para ter ids, trace e estado finais.
- Respostas do analista chegam por polling em `messages?after=` (2 s com analista, 6 s com o agent), que também atualiza o estado e traz `typing.analyst`: com ele, a lista mostra um balão "Analista" com três pontos (`role=status`). O composer avisa o próprio "digitando" (`POST typing`) a cada 1,5 s enquanto há texto, só com analista envolvido; o agent não recebe aviso.
- Opções e cards só aceitam clique na última mensagem do agent com estado `agent` e sem turno em andamento. Clique em opção envia `{optionId, text: label}`; clique num chamado do seletor envia texto `"<id> · <título>"`.
- Rascunho (`draft`): as opções da mesma mensagem viram a barra de ações do card. Ids `confirm` / `edit:<campo>` / `cancel` definem o estilo do botão.
- Contador `userMessages/limit` vem do backend; atingido o limite, o composer bloqueia e oferece nova conversa.
- Texto do agent/analista (e o parcial do streaming) passa por `RichText` (`src/components/chat/RichText.tsx`): Markdown leve (`**negrito**`, `*itálico*`, `` `código` ``, listas `-`/`1.`, parágrafos) vira elementos React, sem HTML cru. Mensagens do funcionário ficam em texto puro. Outra sintaxe aparece literal: as instruções pedem ao modelo "sem markdown pesado".

- Transparência: "Por quê?" na linha de passos abre o detalhe da decisão (`DecisionDetails`); no console, "Ver raciocínio" mostra a versão técnica e já vem aberto quando a segurança foi baixa.

## Console do analista (`src/components/analyst/`)

- Um chat por funcionário: a lista traz um item por pessoa (a conversa ativa, com "· N conversas" quando há mais de uma) e o histórico monta todas as conversas dela em ordem cronológica, separadas pelo divisor "Nova conversa · data · estado" (`History` em `ConversationPane.tsx`, a partir de `detail.thread`). Cabeçalho, rodapé e ações valem para a conversa ativa; os chamados da pessoa ficam no painel lateral.
- Filtros calculados no cliente sobre a lista inteira: "Para você" = `waiting_analyst`; "Com o agent" = `agent`; "Minhas" = `analyst` com `analystId` = eu. A busca vai ao servidor (`q`, debounce 250 ms).
- Polling: lista a cada 4 s, conversa aberta a cada 3 s (sem push). Ações (assumir, devolver, encerrar, responder) recarregam conversa e lista.
- "Digitando": o detalhe traz `employeeTyping`; o histórico mostra um balão do funcionário com três pontos no fim. O composer de quem assumiu avisa `POST typing` a cada 1,5 s enquanto há texto (`ConversationPane`, sem passar pelo `AnalystConsole`). Latência visível ≈ polling + TTL de 4 s.
- Etiqueta "Agent pediu ajuda" ⇔ `transferReason = low_confidence` ([DecisionTrace](../entities/DecisionTrace.md)).
- Cards estruturados (rascunho, chamados, opções) aparecem como resumo em texto: o analista vê o que o funcionário recebeu, sem botões.
- Conversa com `ticketId` tem o botão **"Ver chamado"** no cabeçalho; em `waiting_analyst`/`agent` ele vira "Ver chamado e atender": chama `take` e abre o painel, então ao fechá-lo o analista já está respondendo. Sem `ticketId`, fica o ícone que só abre o painel.
- Painel de chamados começa com **"Resumo do assistente"** (`assistantBrief` em `labels.ts`): motivo e resumo da transferência, última `report-decision` (entendeu/fez/por quê/segurança), passos concluídos e artigos indicados. Derivado do que já está nas mensagens; nenhuma chamada nova ao modelo.
- Diálogos do produto, nunca `window.confirm`/`prompt`: `src/components/ui/Dialog.tsx` (`<dialog>` nativo com `showModal`, Esc e clique no fundo fecham, salvo `busy`; tom `danger` para encerrar). "Encerrar atendimento" passa pelo `ConfirmDialog`; "Resolver chamado" (`ResolveTicketDialog`, botão no chamado da conversa enquanto aberto) pede a solução (10 a 2000 caracteres, mesmas regras do `POST .../resolve`), mapeia `TICKET_NOT_OPEN`/404/503 em texto e, ao resolver, recarrega conversa e lista.
- ≤ 1280 px o painel de chamados sobrepõe a conversa e começa fechado; ≤ 1100 px o rodapé põe os botões em linha própria e o cabeçalho esconde a pílula de estado (o rodapé já o diz); ≤ 720 px lista e conversa viram telas alternadas e os botões ficam só com ícone.

## Pendências

- Números da vitrine do login ("8 s", "72%") são estáticos; não há métrica no backend.
- "Redefinir senha" desabilitado: a API não tem esse fluxo.
- Mensagens do analista não guardam o autor: o console mostra o analista atual da conversa.
- Console sem tela de métricas da central; a API já existe (`analystApi.helpMetrics`, [AnalystConsoleApi](../functions/AnalystConsoleApi.md)).
- "Resolver chamado" só aparece para o chamado da conversa; os demais chamados do funcionário não têm ação no painel.
