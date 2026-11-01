# FrontendUI

Front em Next (App Router) seguindo o protótipo do Anexo C (arquivo Pencil `nexo.pen`, fora do repositório). Código: `src/app/(cliente)/`, `src/app/entrar/`, `src/app/atendente/`, `src/components/`, `src/lib/api.ts`.

## Rotas e papéis

| Rota | Tela do protótipo | Papel |
|---|---|---|
| `/entrar` | Identificação | público |
| `/atendimento` | Chat — Novo chamado / Consulta e transferência | `employee` |
| `/perfil` | Cliente — Meu perfil | `employee` |
| `/atendente` | Atendente — Conversas / Atendimento assumido | `analyst` (ainda placeholder) |

`SessionProvider` chama `GET /api/auth/me`; sem sessão manda para `/entrar`, papel errado manda para a home do papel (`HOME_BY_ROLE`). A sessão é o cookie httpOnly `nexo_session` do backend (`AuthSession`, página a criar pelo back); o front nunca guarda token.

## Invariantes

- `src/lib/api.ts` é o único arquivo que conhece URLs e formatos HTTP. Mudou o contrato (`ChatApi`, página canônica a criar pelo back) → ajustar só ali.
- Tokens visuais (cores, fontes Schibsted Grotesk e Newsreader) vêm das variáveis do `.pen` e vivem em `src/app/globals.css`. Não usar cor solta nos componentes.
- Turno do agent chega por SSE: eventos `action` viram os passos acima do balão ("consultou seus chamados"), `text.delta` o texto parcial. No fim o front recarrega a conversa para ter ids, trace e estado finais.
- Respostas do analista chegam por polling em `messages?after=` (3 s com analista, 6 s com o agent), que também atualiza o estado.
- Opções e cards só aceitam clique na última mensagem do agent com estado `agent` e sem turno em andamento. Clique em opção envia `{optionId, text: label}`; clique num chamado do seletor envia texto `"<id> · <título>"`.
- Rascunho (`draft`): as opções da mesma mensagem viram a barra de ações do card. Ids `confirm` / `edit` / `cancel` definem o estilo do botão.
- Contador `userMessages/limit` vem do backend; atingido o limite, o composer bloqueia e oferece nova conversa.

## Pendências

- Console do analista (`/atendente`): só placeholder com sessão.
- Números da vitrine do login ("8 s", "72%") são estáticos; não há métrica no backend.
- "Redefinir senha" desabilitado: a API não tem esse fluxo.
- Painel de transparência do trace (decisão, confiança) ainda não aparece para o funcionário.
