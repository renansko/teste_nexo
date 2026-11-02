# HelpArticle

Artigo curto da central de ajuda. Código: `src/services/helpCenter/helpCenterService.ts`.

- Campos: `id`, `title`, `body`, `category`, `tags[]`. Seed com 10 artigos (VPN erro 809, horário do service desk, senhas, equipamentos, portal de softwares, Outlook, Wi-Fi, impressora, prazos).
- Busca lexical por tokens (mesma tokenização do dedup, `lexicalScore`): título pesa 3, tags 2, corpo 1; score normalizado pelo tamanho da consulta; devolve os top N.
- `searchArticles` (só artigos) atende a rota `GET /api/help-center`; o agent usa `searchKnowledge`, que mistura artigos e [ResolutionMemory](ResolutionMemory.md) no mesmo ranking e devolve `KnowledgeHit { source, id, title, body, category, score }`. `getKnowledge(source, id)` é o acesso por id no mesmo formato.
- O agent recebe título + corpo e deve conferir se o artigo se aplica (ex.: erro 809 vale só para Windows 10). Cards (`articles`) só aparecem quando o agent cita (`cite-articles`) ou sugere (`suggest-help-article`, que mede o resultado em [HelpFeedback](HelpFeedback.md)); o item do card leva `source` para o rótulo "Central de ajuda" / "Caso resolvido".
- Trocar por busca vetorial/RAG = substituir só `searchKnowledge` (e `searchArticles`).
