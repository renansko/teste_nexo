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
- Respostas do analista chegam por polling em `messages?after=` (3 s com analista, 6 s com o agent), que também atualiza o estado.
- Opções e cards só aceitam clique na última mensagem do agent com estado `agent` e sem turno em andamento. Clique em opção envia `{optionId, text: label}`; clique num chamado do seletor envia texto `"<id> · <título>"`.
- Rascunho (`draft`): as opções da mesma mensagem viram a barra de ações do card. Ids `confirm` / `edit:<campo>` / `cancel` definem o estilo do botão.
- Contador `userMessages/limit` vem do backend; atingido o limite, o composer bloqueia e oferece nova conversa.
- Texto do agent/analista (e o parcial do streaming) passa por `RichText` (`src/components/chat/RichText.tsx`): Markdown leve (`**negrito**`, `*itálico*`, `` `código` ``, listas `-`/`1.`, parágrafos) vira elementos React, sem HTML cru. Mensagens do funcionário ficam em texto puro. Outra sintaxe aparece literal: as instruções pedem ao modelo "sem markdown pesado".

- Transparência: "Por quê?" na linha de passos abre o detalhe da decisão (`DecisionDetails`); no console, "Ver raciocínio" mostra a versão técnica e já vem aberto quando a segurança foi baixa.

## Console do analista (`src/components/analyst/`)

- Filtros calculados no cliente sobre a lista inteira: "Para você" = `waiting_analyst`; "Com o agent" = `agent`; "Minhas" = `analyst` com `analystId` = eu. A busca vai ao servidor (`q`, debounce 250 ms).
- Polling: lista a cada 4 s, conversa aberta a cada 3 s (sem push). Ações (assumir, devolver, encerrar, responder) recarregam conversa e lista.
- Etiqueta "Agent pediu ajuda" ⇔ `transferReason = low_confidence` ([DecisionTrace](../entities/DecisionTrace.md)).
- Cards estruturados (rascunho, chamados, opções) aparecem como resumo em texto: o analista vê o que o funcionário recebeu, sem botões.
- ≤ 1280 px o painel de chamados sobrepõe a conversa e começa fechado; ≤ 720 px lista e conversa viram telas alternadas.

## Pendências

- Números da vitrine do login ("8 s", "72%") são estáticos; não há métrica no backend.
- "Redefinir senha" desabilitado: a API não tem esse fluxo.
- Mensagens do analista não guardam o autor: o console mostra o analista atual da conversa.
