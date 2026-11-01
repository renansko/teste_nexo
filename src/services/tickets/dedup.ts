/**
 * Detecção de duplicidade/reabertura: similaridade lexical simples (Jaccard sobre tokens sem stopwords).
 * Chamado aberto parecido → atualizar; resolvido há ≤ 7 dias parecido → oferecer reabrir.
 * @wiki docs/brain/conventions/ServiceDeskRules.md
 */
import { isOpenStatus, type Ticket } from "./types";

export const REOPEN_WINDOW_DAYS = 7;
const SIMILARITY_THRESHOLD = 0.25;

const STOPWORDS = new Set(
  "a o as os de da do das dos e em um uma para por com sem no na nos nas que meu minha meus minhas esta este isso ao aos à às não nao mais muito ja já quando como pra pro está esta estou tenho ter foi ser é e ou se".split(" "),
);

export function tokenize(text: string): Set<string> {
  const norm = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return new Set(norm.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t)));
}

export function similarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

export interface RelatedTicket {
  ticket: Ticket;
  score: number;
  kind: "duplicate" | "reopenable";
}

export const canReopen = (t: Ticket, now: Date): boolean =>
  t.status === "resolvido" && !!t.resolvedAt && now.getTime() - new Date(t.resolvedAt).getTime() <= REOPEN_WINDOW_DAYS * 86_400_000;

/** Procura, entre os chamados do próprio funcionário, candidatos a duplicado ou reabertura. */
export function findRelated(
  candidate: { title: string; description?: string; category?: string },
  tickets: Ticket[],
  now: Date,
): RelatedTicket[] {
  const text = `${candidate.title} ${candidate.description ?? ""}`;
  const out: RelatedTicket[] = [];
  for (const t of tickets) {
    const open = isOpenStatus(t.status);
    const reopenable = canReopen(t, now);
    if (!open && !reopenable) continue;
    let score = similarity(text, `${t.title} ${t.description}`);
    if (candidate.category && candidate.category === t.category) score += 0.1;
    if (score < SIMILARITY_THRESHOLD) continue;
    out.push({ ticket: t, score, kind: open ? "duplicate" : "reopenable" });
  }
  return out.sort((a, b) => b.score - a.score);
}
