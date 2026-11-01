/**
 * Central de ajuda: artigos curtos com busca lexical (título > tags > corpo).
 * Base pequena por construção; trocar por busca vetorial é só substituir `searchArticles`.
 * @wiki docs/brain/entities/HelpArticle.md
 */
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

export function searchArticles(query: string, limit = 3): ArticleHit[] {
  const q = tokenize(query);
  if (q.size === 0) return [];
  const hits: ArticleHit[] = [];
  for (const article of listArticles()) {
    const title = tokenize(article.title);
    const tags = tokenize(article.tags.join(" "));
    const body = tokenize(article.body);
    let score = 0;
    for (const t of q) {
      if (title.has(t)) score += 3;
      if (tags.has(t)) score += 2;
      if (body.has(t)) score += 1;
    }
    if (score > 0) hits.push({ article, score: score / q.size });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
