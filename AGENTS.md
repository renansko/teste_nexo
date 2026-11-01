# Instruções do repositório

## Brain de contexto

Antes de planejar ou alterar módulos documentados, leia `docs/brain/index.md` e as páginas relacionadas.
O Brain registra contratos, invariantes e decisões não evidentes no código (padrão global: llm-brain-backend).
Compare regras críticas com testes e código antes de assumir que a documentação está correta.
Mudou comportamento, contrato, persistência, integração, efeito colateral ou regra de produto → atualize código e Brain no mesmo trabalho.
Regras: páginas < 100 linhas, nomes em `PascalCase`, links relativos válidos, `index.md` atualizado, `log.md` no formato `data | issue/PR | escopo`, sem segredos/dados pessoais.
