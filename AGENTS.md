# Instruções do repositório

## Brain de contexto

Antes de planejar ou alterar módulos documentados, leia `docs/brain/index.md` e as páginas relacionadas.
O Brain registra contratos, invariantes e decisões não evidentes no código (padrão global: llm-brain-backend).
Compare regras críticas com testes e código antes de assumir que a documentação está correta.
Mudou comportamento, contrato, persistência, integração, efeito colateral ou regra de produto → atualize código e Brain no mesmo trabalho.
Regras: páginas < 100 linhas, nomes em `PascalCase`, links relativos válidos, `index.md` atualizado, `log.md` no formato `data | issue/PR | escopo`, sem segredos/dados pessoais.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
