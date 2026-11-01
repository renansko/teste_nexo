/**
 * Prioridade = impacto (quantas pessoas) × urgência (compromisso em risco). Anexo A.
 * Determinístico: o agent coleta impacto/urgência e a regra decide — nada de "achismo" do modelo.
 * @wiki docs/brain/conventions/ServiceDeskRules.md
 */
import type { TicketPriority } from "./types";

export const IMPACTS = ["eu", "equipe", "empresa"] as const;
export const URGENCIES = ["parado", "compromisso_hoje", "atrapalha", "sem_urgencia"] as const;
export type Impact = (typeof IMPACTS)[number];
export type Urgency = (typeof URGENCIES)[number];

export const IMPACT_LABEL: Record<Impact, string> = {
  eu: "Só eu",
  equipe: "Minha equipe",
  empresa: "A empresa toda",
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  parado: "Parou, não consigo trabalhar",
  compromisso_hoje: "Tenho um compromisso hoje que depende disso",
  atrapalha: "Atrapalha, mas tenho alternativa",
  sem_urgencia: "Sem urgência (pedido ou melhoria)",
};

export function priorityFor(impact: Impact, urgency: Urgency): { priority: TicketPriority; reason: string } {
  if (urgency === "parado" && impact !== "eu") {
    return { priority: "critica", reason: `algo parado para ${impact === "equipe" ? "uma equipe" : "a empresa"}` };
  }
  if (urgency === "parado") return { priority: "alta", reason: "impede uma pessoa de trabalhar" };
  if (urgency === "compromisso_hoje") return { priority: "alta", reason: "há um compromisso no mesmo dia" };
  if (urgency === "atrapalha") return { priority: "media", reason: "atrapalha, mas há alternativa" };
  return { priority: "baixa", reason: "pedido ou melhoria sem urgência" };
}
