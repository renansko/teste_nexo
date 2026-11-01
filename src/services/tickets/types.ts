/** @wiki docs/brain/entities/Ticket.md */
export const TICKET_TYPES = ["INC", "REQ"] as const;
export const TICKET_CATEGORIES = ["Acesso", "Rede e VPN", "Hardware", "Software", "E-mail", "Outros"] as const;
export const TICKET_PRIORITIES = ["critica", "alta", "media", "baixa"] as const;
export const TICKET_STATUSES = ["aberto", "em_atendimento", "aguardando_analista", "aprovado", "resolvido", "fechado"] as const;
/** Status em que o chamado ainda está "vivo" (conta para duplicidade e para prazo). */
export const OPEN_STATUSES: readonly TicketStatus[] = ["aberto", "em_atendimento", "aguardando_analista", "aprovado"];

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface Ticket {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  requesterId: string;
  affected: string;
  createdAt: string;
  updatedAt: string;
  /** Prazo da próxima resposta/atualização; renovado a cada atualização. */
  dueAt: string;
  resolvedAt: string | null;
}

export interface TicketUpdate {
  id: number;
  ticketId: string;
  authorId: string;
  authorRole: "employee" | "analyst" | "agent" | "system";
  text: string;
  createdAt: string;
}

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: "Aberto",
  em_atendimento: "Em atendimento",
  aguardando_analista: "Aguardando analista",
  aprovado: "Aprovado",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

export const isOpenStatus = (s: TicketStatus): boolean => OPEN_STATUSES.includes(s);
