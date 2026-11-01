# AgentBoundary

O agent só acessa dados de chamados por tools. Resolve acoplamento entre LLM e dados (requisito: serviço separado do agent).

- Aplicar: qualquer nova capacidade do agent vira tool em `src/agent/tools.ts`.
- Não aplicar: persistência de conversas é do orquestrador (`handleMessage.ts`), não do agent.
- Risco: o agent passa a ler/escrever tabelas diretamente e o serviço não pode mais ser trocado.
