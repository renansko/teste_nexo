# HelpArticle

Artigo curto da central de ajuda. Código: `src/services/helpCenter/helpCenterService.ts`.

- Campos: `id`, `title`, `body`, `category`, `tags[]`. Seed com 10 artigos (VPN erro 809, horário do service desk, senhas, equipamentos, portal de softwares, Outlook, Wi-Fi, impressora, prazos).
- Busca lexical por tokens (mesma tokenização do dedup): título pesa 3, tags 2, corpo 1; score normalizado pelo tamanho da consulta; devolve os top N.
- O agent recebe título + corpo e deve conferir se o artigo se aplica (ex.: erro 809 vale só para Windows 10); o payload `articles` mostra até 2 ao funcionário.
- Trocar por busca vetorial = substituir só `searchArticles`.
