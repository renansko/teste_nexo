/**
 * Central de ajuda. A busca é só para o agent ler; o que aparece ao funcionário são os artigos que o agent
 * de fato usou na resposta (`cite-articles`). Assim um resultado fraco da busca não vira card fora de contexto.
 * @wiki docs/brain/services/NexoAssistant.md
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { ToolSpec } from "@/engine/types";
import { getArticle, searchArticles } from "@/services/helpCenter/helpCenterService";
import { articlesPart, OPEN_TICKET_OPTION, optionsPart } from "../payload";

type Hit = { id: string; title: string; body: string; category: string };

export const searchHelpCenter: ToolSpec<{ query: string }, Hit[]> = {
  label: "buscou na central de ajuda",
  tool: createTool({
    id: "search-help-center",
    description:
      "Busca artigos curtos na central de ajuda de TI (procedimentos, horários, prazos). Use antes de abrir chamado para dúvidas e problemas comuns. Os resultados são só para você ler; nada aparece ao funcionário. Para mostrar um artigo que você usou, chame cite-articles.",
    inputSchema: z.object({ query: z.string().min(2).describe("Palavras-chave do problema ou dúvida") }),
    execute: async ({ query }) => searchArticles(query, 3).map(({ article }) => ({ id: article.id, title: article.title, body: article.body, category: article.category })),
  }),
  summarize: (_i, hits) => (hits.length ? `${hits.length} artigo(s): ${hits.map((h) => h.title).join("; ")}` : "nenhum artigo encontrado"),
  // Regra determinística: depois de consultar a central, o funcionário sempre pode seguir para o chamado dali mesmo
  // (o artigo pode não resolver, ou dizer que o caso é uma requisição). O agent então chama open-ticket com o que já sabe.
  // Os artigos em si só aparecem quando o agent os cita (cite-articles).
  toPayload: () => [optionsPart([OPEN_TICKET_OPTION])],
};

export const citeArticles: ToolSpec<{ ids: string[] }, Hit[]> = {
  label: "indicou artigos",
  hidden: true, // o passo visível é a busca; os cards já mostram o que foi indicado
  tool: createTool({
    id: "cite-articles",
    description:
      "Mostra ao funcionário os artigos da central de ajuda que você usou na resposta (ids vindos de search-help-center). Só chame se o artigo realmente se aplica ao caso dele; se nenhum se aplica, não chame.",
    inputSchema: z.object({ ids: z.array(z.string()).min(1).max(2) }),
    execute: async ({ ids }) =>
      ids.map((id) => getArticle(id)).filter((a) => !!a).map((a) => ({ id: a!.id, title: a!.title, body: a!.body, category: a!.category })),
  }),
  toPayload: (_i, hits) => (hits.length ? [articlesPart(hits)] : undefined),
};
