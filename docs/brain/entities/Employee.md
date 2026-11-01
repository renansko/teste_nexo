# Employee

Funcionário da Nexo ou analista do service desk. Código: `src/services/employees/employeeService.ts`; seed em `src/assistants/nexo/seed.ts`.

- `role`: `employee` (usa o chat) ou `analyst` (usa o console). Um analista não envia mensagens como funcionário (`POST /api/conversations/:id/messages` exige `employee`).
- Login é por e-mail corporativo; a senha é ignorada (requisito do desafio). O id do funcionário (`sub` do token) é a chave de privacidade dos chamados e das conversas.
- Busca por e-mail é case-insensitive.
- Seed: 5 funcionários e 2 analistas, idempotente por id.

Ver [AuthSession](../conventions/AuthSession.md).
