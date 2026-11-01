import type { TicketPriority } from "@/lib/api";

export const PRIORITY_DOT: Record<TicketPriority, string> = {
  critica: "var(--danger)",
  alta: "var(--warning)",
  media: "#1b243166",
  baixa: "#1b243133",
};

/** Cor do ponto de status do chamado (status vem do backend em snake_case). */
export function statusDot(status: string): string {
  switch (status) {
    case "aguardando_analista":
      return "var(--warning)";
    case "aberto":
    case "em_atendimento":
      return "var(--primary)";
    case "aprovado":
    case "resolvido":
      return "var(--success)";
    default:
      return "#1b243166";
  }
}
