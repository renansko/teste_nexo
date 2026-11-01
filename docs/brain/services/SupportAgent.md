# SupportAgent

Agent Mastra de suporte. Código: `src/agent/supportAgent.ts`, `src/agent/tools.ts`.

- Modelo via `NEXO_MODEL` (Anthropic). Instruções em pt-BR; não inventa dados de chamados.
- Tools fixas: `get-ticket`, `list-tickets` (somente leitura).
- Tool por requisição: `escalate-to-analyst` (criada em `handleMessage.ts` para fechar sobre o id da conversa).
- Não escreve em banco diretamente: ver [AgentBoundary](../conventions/AgentBoundary.md).
