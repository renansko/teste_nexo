import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { ToolSpec } from "@/engine/types";
import { searchArticles } from "@/services/helpCenter/helpCenterService";
import { articlesPart } from "../payload";

type Hit = { id: string; title: string; body: string; category: string };

export const searchHelpCenter: ToolSpec<{ query: string }, Hit[]> = {
  label: "buscou na central de ajuda",
  tool: createTool({
    id: "search-help-center",
    description: "Busca artigos curtos na central de ajuda de TI (procedimentos, horários, prazos). Use antes de abrir chamado para dúvidas e problemas comuns.",
    inputSchema: z.object({ query: z.string().min(2).describe("Palavras-chave do problema ou dúvida") }),
    execute: async ({ query }) => searchArticles(query, 3).map(({ article }) => ({ id: article.id, title: article.title, body: article.body, category: article.category })),
  }),
  summarize: (_i, hits) => (hits.length ? `${hits.length} artigo(s): ${hits.map((h) => h.title).join("; ")}` : "nenhum artigo encontrado"),
  toPayload: (_i, hits) => (hits.length ? [articlesPart(hits.slice(0, 2))] : undefined),
};
