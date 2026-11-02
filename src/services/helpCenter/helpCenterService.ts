/**
 * Central de ajuda: artigos curtos + memória de resolução (o que o analista escreveu ao resolver um chamado),
 * com busca lexical (título > tags > corpo). Base pequena por construção; trocar por busca vetorial é só
 * substituir `searchKnowledge`/`searchArticles`.
 * @wiki docs/brain/entities/HelpArticle.md
 * @wiki docs/brain/entities/ResolutionMemory.md
 */
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { tokenize } from "@/services/tickets/dedup";

export interface HelpArticle {
  id: string;
  title: string;
  body: string;
  category: string;
  tags: string[];
}

interface Row { id: string; title: string; body: string; category: string; tags: string }
const toArticle = (r: Row): HelpArticle => ({ id: r.id, title: r.title, body: r.body, category: r.category, tags: JSON.parse(r.tags) as string[] });

export function listArticles(): HelpArticle[] {
  return (getDb().prepare(`SELECT id, title, body, category, tags FROM help_articles ORDER BY id`).all() as unknown as Row[]).map(toArticle);
}

export function getArticle(id: string): HelpArticle | undefined {
  const r = getDb().prepare(`SELECT id, title, body, category, tags FROM help_articles WHERE id = ?`).get(id) as Row | undefined;
  return r && toArticle(r);
}

export function upsertArticle(a: HelpArticle): void {
  getDb().prepare(
    `INSERT INTO help_articles (id, title, body, category, tags, created_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body, category = excluded.category, tags = excluded.tags`,
  ).run(a.id, a.title, a.body, a.category, JSON.stringify(a.tags), new Date().toISOString());
}

export interface ArticleHit { article: HelpArticle; score: number }

/** Pontuação lexical: título pesa 3, tags 2, corpo 1; normalizada pelo tamanho da consulta. */
function lexicalScore(q: Set<string>, doc: { title: string; tags: string[]; body: string }): number {
  const title = tokenize(doc.title);
  const tags = tokenize(doc.tags.join(" "));
  const body = tokenize(doc.body);
  let score = 0;
  for (const t of q) {
    if (title.has(t)) score += 3;
    if (tags.has(t)) score += 2;
    if (body.has(t)) score += 1;
  }
  return score / q.size;
}

export function searchArticles(query: string, limit = 3): ArticleHit[] {
  const q = tokenize(query);
  if (q.size === 0) return [];
  const hits: ArticleHit[] = [];
  for (const article of listArticles()) {
    const score = lexicalScore(q, article);
    if (score > 0) hits.push({ article, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---- Memória de resolução ----

/**
 * O que o analista escreveu ao resolver um chamado, guardado como conhecimento reutilizável.
 * Privacidade (Anexo A): só título, tipo, categoria e solução. Descrição, atualizações e solicitante do chamado
 * nunca entram; `ticketId` é referência interna e não sai para o modelo nem para o funcionário.
 * @wiki docs/brain/entities/ResolutionMemory.md
 */
export interface ResolutionMemory {
  id: string;
  ticketId: string;
  type: string;
  category: string;
  title: string;
  solution: string;
  /** Artigos/soluções sugeridos ao funcionário antes do chamado e que não resolveram (`source:id`). */
  triedArticleIds: string[];
  resolvedBy: string;
  resolvedAt: string;
}

interface MemoryRow { id: string; ticket_id: string; type: string; category: string; title: string; solution: string; tried_article_ids: string; resolved_by: string; resolved_at: string }
const toMemory = (r: MemoryRow): ResolutionMemory => ({
  id: r.id, ticketId: r.ticket_id, type: r.type, category: r.category, title: r.title, solution: r.solution,
  triedArticleIds: JSON.parse(r.tried_article_ids) as string[], resolvedBy: r.resolved_by, resolvedAt: r.resolved_at,
});

/** Grava (ou substitui, se o chamado for resolvido de novo) a memória de um chamado. */
export function rememberResolution(input: Omit<ResolutionMemory, "id"> & { id?: string }): ResolutionMemory {
  const existing = getDb().prepare(`SELECT id FROM resolution_memories WHERE ticket_id = ?`).get(input.ticketId) as { id: string } | undefined;
  const id = existing?.id ?? input.id ?? randomUUID();
  getDb().prepare(
    `INSERT INTO resolution_memories (id, ticket_id, type, category, title, solution, tried_article_ids, resolved_by, resolved_at) VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(ticket_id) DO UPDATE SET solution = excluded.solution, tried_article_ids = excluded.tried_article_ids, resolved_by = excluded.resolved_by, resolved_at = excluded.resolved_at`,
  ).run(id, input.ticketId, input.type, input.category, input.title, input.solution, JSON.stringify(input.triedArticleIds), input.resolvedBy, input.resolvedAt);
  return getResolution(id)!;
}

export function getResolution(id: string): ResolutionMemory | undefined {
  const r = getDb().prepare(`SELECT * FROM resolution_memories WHERE id = ?`).get(id) as MemoryRow | undefined;
  return r && toMemory(r);
}

export function listResolutions(): ResolutionMemory[] {
  return (getDb().prepare(`SELECT * FROM resolution_memories ORDER BY resolved_at DESC`).all() as unknown as MemoryRow[]).map(toMemory);
}

// ---- Busca unificada (artigos + memória): o que o agent consulta ----

export type KnowledgeSource = "article" | "resolution";

/** Resultado que vai ao agent e, se ele sugerir, ao funcionário. Nunca carrega id do chamado nem solicitante. */
export interface KnowledgeHit {
  source: KnowledgeSource;
  id: string;
  title: string;
  body: string;
  category: string;
  score: number;
}

const memoryHit = (m: ResolutionMemory): Omit<KnowledgeHit, "score"> => ({ source: "resolution", id: m.id, title: m.title, body: m.solution, category: m.category });
const articleHit = (a: HelpArticle): Omit<KnowledgeHit, "score"> => ({ source: "article", id: a.id, title: a.title, body: a.body, category: a.category });

/** Artigo ou memória pelo par (fonte, id), já no formato que sai para fora. */
export function getKnowledge(source: KnowledgeSource, id: string): Omit<KnowledgeHit, "score"> | undefined {
  if (source === "article") {
    const a = getArticle(id);
    return a && articleHit(a);
  }
  const m = getResolution(id);
  return m && memoryHit(m);
}

/** Busca lexical sobre artigos e memórias de resolução juntos. Trocar por busca vetorial = substituir só esta função. */
export function searchKnowledge(query: string, limit = 3): KnowledgeHit[] {
  const q = tokenize(query);
  if (q.size === 0) return [];
  const hits: KnowledgeHit[] = [];
  for (const a of listArticles()) {
    const score = lexicalScore(q, a);
    if (score > 0) hits.push({ ...articleHit(a), score });
  }
  for (const m of listResolutions()) {
    const score = lexicalScore(q, { title: m.title, tags: [m.category, m.type], body: m.solution });
    if (score > 0) hits.push({ ...memoryHit(m), score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
