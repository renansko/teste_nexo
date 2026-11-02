/** Diálogo do produto no lugar de confirm()/prompt(): título, descrição, tom e botões no HTML (render de servidor). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmDialog } from "./Dialog";
import { ResolveTicketDialog } from "@/components/analyst/ResolveTicketDialog";
import type { TicketView } from "@/lib/api";

test("confirmação de encerrar: tom de perigo, pergunta e os dois botões", () => {
  const html = renderToStaticMarkup(
    <ConfirmDialog
      open
      tone="danger"
      title="Encerrar o atendimento?"
      description="O funcionário não poderá mais enviar mensagens nesta conversa."
      confirmLabel="Encerrar atendimento"
      onConfirm={() => {}}
      onClose={() => {}}
    />,
  );
  assert.match(html, /<dialog[^>]*data-tone="danger"/);
  assert.match(html, /aria-labelledby/);
  assert.match(html, /Encerrar o atendimento\?/);
  assert.match(html, /não poderá mais enviar mensagens/);
  assert.match(html, />Cancelar</);
  assert.match(html, />Encerrar atendimento</);
  assert.doesNotMatch(html, /window\.confirm/);
});

const ticket = {
  id: "INC-20311", type: "INC", category: "Hardware", title: "Notebook não liga", description: "Sem reação ao ligar.",
  status: "em_atendimento", statusLabel: "Em atendimento", priority: "alta", priorityLabel: "Alta",
  affected: 1, slaLabel: "4h úteis", dueAt: "2026-11-02T12:00:00.000Z", overdue: false, resolvedAt: null,
} as unknown as TicketView;

test("resolver chamado: id e título no diálogo, campo de solução e botão desabilitado até o mínimo", () => {
  const html = renderToStaticMarkup(<ResolveTicketDialog ticket={ticket} onResolved={() => {}} onClose={() => {}} />);
  assert.match(html, /Resolver INC-20311/);
  assert.match(html, /<strong>Notebook não liga<\/strong>/);
  assert.match(html, /<textarea[^>]*id="resolve-ticket-solution"/);
  assert.match(html, /mínimo 10 caracteres/);
  assert.match(html, /<button type="submit"[^>]*disabled=""[^>]*>Resolver chamado<\/button>/);
});

test("resolver chamado fechado (ticket null) não renderiza o campo", () => {
  const html = renderToStaticMarkup(<ResolveTicketDialog ticket={null} onResolved={() => {}} onClose={() => {}} />);
  assert.doesNotMatch(html, /<textarea/);
});
