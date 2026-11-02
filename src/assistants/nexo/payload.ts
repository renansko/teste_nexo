/** Partes estruturadas que a persona Nexo envia ao cliente (cards de chamado, artigos). */
import type { PayloadPart, QuickOption } from "@/engine/types";
import type { TicketView } from "@/services/tickets/ticketService";
import type { TicketUpdate } from "@/services/tickets/types";

export const PAYLOAD_TICKETS = "tickets" as const;
export const PAYLOAD_TICKET = "ticket" as const;
export const PAYLOAD_ARTICLES = "articles" as const;

export const ANALYST_OPTION: QuickOption = { id: "falar-com-um-analista", label: "Falar com um analista" };
export const OPEN_TICKET_OPTION: QuickOption = { id: "abrir-um-chamado", label: "Abrir um chamado" };

export const ticketsPart = (tickets: TicketView[]): PayloadPart => ({ kind: PAYLOAD_TICKETS, data: tickets });
export const ticketPart = (ticket: TicketView, updates: TicketUpdate[]): PayloadPart => ({ kind: PAYLOAD_TICKET, data: { ticket, updates } });
/** Card de conhecimento: artigo da central (`source` ausente ou `article`) ou solução de um caso já resolvido (`resolution`). */
export const articlesPart = (articles: { id: string; title: string; body: string; source?: "article" | "resolution" }[]): PayloadPart => ({ kind: PAYLOAD_ARTICLES, data: articles });
export const optionsPart = (options: QuickOption[]): PayloadPart => ({ kind: "options", data: options });

/** Opção de seleção de um chamado (o rótulo vira a mensagem do usuário ao clicar). */
export const ticketOption = (t: TicketView): QuickOption => ({ id: t.id.toLowerCase(), label: `${t.id} · ${t.title}`.slice(0, 60) });
