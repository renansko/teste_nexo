/**
 * Prazos do service desk (Anexo A): Crítica 1h corrida; Alta 4h úteis; Média 3 dias úteis; Baixa 5 dias úteis.
 * Horário útil: segunda a sexta, 08:00–18:00, no fuso de `NEXO_BUSINESS_TZ_OFFSET_MINUTES` (padrão -180, Brasília).
 * @wiki docs/brain/conventions/ServiceDeskRules.md
 */
import type { TicketPriority } from "./types";
import { env } from "@/lib/env";

const BUSINESS_START_H = 8;
const BUSINESS_END_H = 18;
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export const SLA_LABEL: Record<TicketPriority, string> = {
  critica: "1 hora",
  alta: "4 horas úteis",
  media: "3 dias úteis",
  baixa: "5 dias úteis",
};

const tzOffsetMs = (): number => env().NEXO_BUSINESS_TZ_OFFSET_MINUTES * MIN;

/** Representa o instante como "horário local" num Date cujos campos UTC são os locais. */
const toLocal = (d: Date): Date => new Date(d.getTime() + tzOffsetMs());
const fromLocal = (d: Date): Date => new Date(d.getTime() - tzOffsetMs());

const isWeekend = (local: Date): boolean => local.getUTCDay() === 0 || local.getUTCDay() === 6;

function nextBusinessStart(local: Date): Date {
  const next = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, BUSINESS_START_H));
  while (isWeekend(next)) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Move para dentro do expediente se estiver fora dele. */
function clampToBusiness(local: Date): Date {
  if (isWeekend(local)) return nextBusinessStart(new Date(local.getTime() - DAY));
  const h = local.getUTCHours() + local.getUTCMinutes() / 60;
  if (h < BUSINESS_START_H) return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), BUSINESS_START_H));
  if (h >= BUSINESS_END_H) return nextBusinessStart(local);
  return local;
}

export function addBusinessHours(from: Date, hours: number): Date {
  let t = clampToBusiness(toLocal(from));
  let remaining = hours * 60 * MIN;
  while (remaining > 0) {
    const endOfDay = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), BUSINESS_END_H);
    const available = endOfDay - t.getTime();
    if (remaining <= available) {
      t = new Date(t.getTime() + remaining);
      remaining = 0;
    } else {
      remaining -= available;
      t = nextBusinessStart(t);
    }
  }
  return fromLocal(t);
}

export function addBusinessDays(from: Date, days: number): Date {
  const t = clampToBusiness(toLocal(from));
  let left = days;
  while (left > 0) {
    t.setUTCDate(t.getUTCDate() + 1);
    if (!isWeekend(t)) left -= 1;
  }
  return fromLocal(t);
}

export function computeDueAt(priority: TicketPriority, from: Date): Date {
  switch (priority) {
    case "critica":
      return new Date(from.getTime() + 60 * MIN);
    case "alta":
      return addBusinessHours(from, 4);
    case "media":
      return addBusinessDays(from, 3);
    case "baixa":
      return addBusinessDays(from, 5);
  }
}

export const isPastDue = (dueAt: string | Date, now: Date): boolean => new Date(dueAt).getTime() < now.getTime();
