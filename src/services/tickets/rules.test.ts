import { test } from "node:test";
import assert from "node:assert/strict";
import { priorityFor } from "./priority";
import { findRelated, similarity } from "./dedup";
import type { Ticket } from "./types";

test("matriz impacto × urgência", () => {
  assert.equal(priorityFor("equipe", "parado").priority, "critica");
  assert.equal(priorityFor("empresa", "parado").priority, "critica");
  assert.equal(priorityFor("eu", "parado").priority, "alta");
  assert.equal(priorityFor("eu", "compromisso_hoje").priority, "alta");
  assert.equal(priorityFor("equipe", "atrapalha").priority, "media");
  assert.equal(priorityFor("eu", "sem_urgencia").priority, "baixa");
});

const base: Ticket = {
  id: "INC-1", type: "INC", title: "", description: "", category: "Hardware", priority: "media", status: "aberto",
  requesterId: "emp-ana", affected: "Só eu", createdAt: "", updatedAt: "", dueAt: "", resolvedAt: null,
};
const now = new Date("2026-03-02T13:00:00.000Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

test("similaridade ignora acentos e stopwords", () => {
  assert.ok(similarity("Notebook lento após atualização", "o notebook está lento depois da atualizacao do windows") > 0.3);
  assert.equal(similarity("impressora não imprime", "senha do SAP bloqueada"), 0);
});

test("duplicado aberto e reabertura em 7 dias", () => {
  const tickets: Ticket[] = [
    { ...base, id: "INC-10", title: "Notebook lento após atualização do Windows", description: "trava ao abrir o Excel" },
    { ...base, id: "INC-11", title: "Senha do SAP bloqueada", description: "usuário bloqueado", category: "Acesso", status: "resolvido", resolvedAt: daysAgo(4) },
    { ...base, id: "INC-12", title: "Senha do SAP bloqueada de novo", description: "usuário bloqueado", category: "Acesso", status: "resolvido", resolvedAt: daysAgo(20) },
  ];
  const dup = findRelated({ title: "meu notebook está lento depois da atualização", category: "Hardware" }, tickets, now);
  assert.equal(dup[0]?.ticket.id, "INC-10");
  assert.equal(dup[0]?.kind, "duplicate");

  const reopen = findRelated({ title: "SAP bloqueou minha senha", category: "Acesso" }, tickets, now);
  assert.deepEqual(reopen.map((r) => [r.ticket.id, r.kind]), [["INC-11", "reopenable"]]);
});
