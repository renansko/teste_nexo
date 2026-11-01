# AuthSession

Sessão assinada sem dependências. Código: `src/engine/auth/token.ts`; rotas `src/app/api/auth/*`.

- Token = `base64url(JSON{sub, role, exp}).base64url(HMAC-SHA256)`; segredo `NEXO_AUTH_SECRET` (fallback de dev com aviso no log; obrigatório em produção). Validade 7 dias.
- Aceito em `Authorization: Bearer` (prioridade) ou cookie `nexo_session` (httpOnly, SameSite=Lax, Secure em produção). Serve o front Next e integradores externos.
- `requireSession(req, { role? })`: 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`. O usuário é recarregado do banco a cada requisição (token de funcionário removido deixa de valer).
- Login aceita qualquer senha para e-mails cadastrados (requisito do desafio). Em produto real: trocar `login/route.ts` por SSO, mantendo `signSession`.
- Comparação de assinatura em tempo constante.
