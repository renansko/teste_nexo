/**
 * Central de ajuda. A busca é só para o agent ler (artigos e soluções de casos já resolvidos); o que aparece ao
 * funcionário é o que o agent de fato usou: `cite-articles` para respostas informativas, `suggest-help-article`
 * quando há um procedimento que deve resolver o problema. Esta última é human-in-the-loop: mostra o card, pergunta
 * "isso resolveu?" e pausa a run; a resposta fecha a linha de feedback (métrica de acerto da IA e da FAQ).
 * @wiki docs/brain/services/NexoAssistant.md
 * @wiki docs/brain/entities/HelpFeedback.md
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { QuickOption, ResumeAnswer, SuspendPrompt, ToolSpec } from "@/engine/types";
import { hitl } from "@/engine/tools/hitl";
import { AppError } from "@/lib/errors";
import { getKnowledge, searchKnowledge, type KnowledgeHit, type KnowledgeSource } from "@/services/helpCenter/helpCenterService";
import { answerFeedback, openFeedback, type FeedbackOutcome } from "@/services/helpCenter/feedbackService";
import { ANALYST_OPTION, articlesPart, OPEN_TICKET_OPTION, optionsPart } from "../payload";
import { turnContext } from "./context";

type Hit = Omit<KnowledgeHit, "score">;
const SOURCES = ["article", "resolution"] as const;

export const searchHelpCenter: ToolSpec<{ query: string }, Hit[]> = {
  label: "buscou na central de ajuda",
  quiet: true, // consulta de rotina: o funcionário vê a resposta (e os artigos citados), não o passo
  tool: createTool({
    id: "search-help-center",
    description:
      "Busca na central de ajuda de TI: artigos curtos (procedimentos, horários, prazos) e soluções de casos que analistas já resolveram (source=resolution). Use antes de abrir chamado para dúvidas e problemas comuns. Os resultados são só para você ler; nada aparece ao funcionário. Se um resultado traz um procedimento que deve resolver o problema dele, chame suggest-help-article; para mostrar um artigo usado numa resposta informativa, chame cite-articles.",
    inputSchema: z.object({ query: z.string().min(2).describe("Palavras-chave do problema ou dúvida") }),
    execute: async ({ query }) => searchKnowledge(query, 3).map(({ score: _s, ...hit }) => hit),
  }),
  summarize: (_i, hits) => (hits.length ? `${hits.length} resultado(s): ${hits.map((h) => h.title).join("; ")}` : "nenhum artigo encontrado"),
  // Regra determinística: depois de consultar a central, o funcionário sempre pode seguir para o chamado dali mesmo
  // (o artigo pode não resolver, ou dizer que o caso é uma requisição). O agent então chama open-ticket com o que já sabe.
  // Os artigos em si só aparecem quando o agent os cita (cite-articles) ou sugere (suggest-help-article).
  toPayload: () => [optionsPart([OPEN_TICKET_OPTION])],
};

export const citeArticles: ToolSpec<{ ids: string[] }, Hit[]> = {
  label: "indicou artigos",
  hidden: true, // o passo visível é a busca; os cards já mostram o que foi indicado
  tool: createTool({
    id: "cite-articles",
    description:
      "Mostra ao funcionário os artigos da central de ajuda que você usou numa resposta informativa (ids vindos de search-help-center). Só chame se o artigo realmente se aplica ao caso dele; se nenhum se aplica, não chame. Para um procedimento que deve resolver o problema, use suggest-help-article em vez desta.",
    inputSchema: z.object({ ids: z.array(z.string()).min(1).max(2) }),
    execute: async ({ ids }) => ids.map((id) => getKnowledge("article", id) ?? getKnowledge("resolution", id)).filter((a): a is Hit => !!a),
  }),
  toPayload: (_i, hits) => (hits.length ? [articlesPart(hits)] : undefined),
};

// ---- suggest-help-article (human-in-the-loop) ----

/** Mesmo formato de `SuspendPrompt` (o engine renderiza `text` + `options` + `payload`; `data` volta para a tool). */
const suspendSchema = z.object({
  text: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  payload: z.array(z.object({ kind: z.string(), data: z.unknown() })).optional(),
  stepKey: z.string().optional(),
  data: z.record(z.string(), z.string()).optional(),
  cancelText: z.string().optional(),
});
const resumeSchema = z.object({ text: z.string().optional(), optionId: z.string().optional() });

export const RESOLVED_OPTION: QuickOption = { id: "resolveu", label: "Resolveu" };
export const NOT_RESOLVED_OPTION: QuickOption = { id: "nao-resolveu", label: "Não resolveu" };
const FEEDBACK_OPTIONS: QuickOption[] = [RESOLVED_OPTION, NOT_RESOLVED_OPTION, ANALYST_OPTION];
const QUESTION = "Siga os passos acima e me diga: isso resolveu?";
const CANCEL_TEXT = "Ok, deixo isso de lado. Se quiser, é só me dizer o que precisa.";

type Answered = Exclude<FeedbackOutcome, "pending">;

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Clique nos botões é inequívoco; texto livre só entra nos casos claros, o resto fica `unclear` para o modelo decidir. */
export function interpretFeedback(answer: ResumeAnswer): Answered {
  if (answer.optionId === RESOLVED_OPTION.id) return "resolved";
  if (answer.optionId === NOT_RESOLVED_OPTION.id) return "not_resolved";
  if (answer.optionId === ANALYST_OPTION.id) return "analyst";
  const t = normalize(answer.text ?? "");
  if (!t) return "unclear";
  if (/\banalista\b/.test(t)) return "analyst";
  const negative = /\bnao\b/.test(t);
  const positive = /\b(resolveu|resolvido|funcionou|deu certo|consegui|voltou a funcionar)\b/.test(t);
  if (/\b(continua|persiste|mesma coisa|mesmo erro|ainda)\b/.test(t) || (negative && positive)) return "not_resolved";
  if (positive) return "resolved";
  if (/^(sim|isso|ok|certo|perfeito|obrigad[oa])\b/.test(t)) return "resolved";
  if (/^(nao|negativo)\b/.test(t)) return "not_resolved";
  return "unclear";
}

/** Orientação para o modelo no passo seguinte à resposta do funcionário. */
const NEXT_STEP: Record<Answered, string> = {
  resolved: "Resolvido sem chamado: encerre cordialmente e não abra chamado.",
  not_resolved: "Não resolveu: chame open-ticket com tudo que o funcionário já contou e inclua na descrição o que foi tentado.",
  analyst: "Ele quer um analista: chame transfer-to-analyst com um resumo do caso e do que foi tentado.",
  unclear: "A resposta não diz se resolveu: leia employeeText e decida (responder, perguntar de novo ou seguir para o chamado).",
};

interface SuggestInput { source: KnowledgeSource; id: string; problem: string; note?: string }
interface SuggestOutput { feedback: Answered; employeeText?: string; source: KnowledgeSource; id: string; title: string; next: string }

export const suggestHelpArticle: ToolSpec<SuggestInput, SuggestOutput | undefined> = {
  label: ({ source }) => (source === "resolution" ? "sugeriu uma solução de caso resolvido" : "sugeriu um artigo da central"),
  tool: createTool({
    id: "suggest-help-article",
    description:
      "Sugere ao funcionário um procedimento da central de ajuda (artigo ou solução de caso resolvido, vindo de search-help-center) que deve resolver o problema dele. A tool mostra o card, pergunta se resolveu e pausa a conversa até ele responder (não chame report-decision antes dela). Quando a execução continuar, ela devolve feedback (resolved, not_resolved, analyst ou unclear) e o próximo passo. Só use se o procedimento se aplica ao caso (ex.: erro 809 só no Windows 10); para respostas informativas use cite-articles.",
    inputSchema: z.object({
      source: z.enum(SOURCES).describe("article (artigo da central) ou resolution (solução de caso resolvido)"),
      id: z.string().describe("Id do resultado de search-help-center"),
      problem: z.string().min(5).max(300).describe("O problema do funcionário em uma frase, nas palavras dele (vai para a métrica da central)"),
      note: z.string().max(400).optional().describe("Frase curta sua adaptando o procedimento ao caso dele, se ajudar"),
    }),
    suspendSchema,
    resumeSchema,
    execute: async (input, context) => {
      const ctx = turnContext(context);
      const { suspend, suspendPayload: suspended, resumeData: answer } = hitl<SuspendPrompt, ResumeAnswer>(context);
      const hit = getKnowledge(input.source, input.id);
      if (!hit) throw new AppError("KNOWLEDGE_NOT_FOUND", `${input.source === "resolution" ? "Solução" : "Artigo"} ${input.id} não existe na central; use um id devolvido por search-help-center.`, 404);

      if (suspended && answer) {
        // Retomada: a tool roda de novo com o input original; a linha de feedback aberta viaja em `data`.
        const feedback = interpretFeedback(answer);
        const feedbackId = suspended.data?.feedbackId;
        if (feedbackId) answerFeedback(feedbackId, feedback, answer.text, ctx.now);
        return { feedback, employeeText: answer.text, source: hit.source, id: hit.id, title: hit.title, next: NEXT_STEP[feedback] };
      }

      const feedbackId = openFeedback({ conversationId: ctx.conversationId, employeeId: ctx.userId, source: input.source, sourceId: input.id, problem: input.problem }, ctx.now);
      const lead = input.note?.trim();
      await suspend?.({
        text: lead ? `${lead}\n\n${QUESTION}` : QUESTION,
        options: FEEDBACK_OPTIONS,
        payload: [articlesPart([hit])],
        data: { feedbackId },
        cancelText: CANCEL_TEXT,
      });
      return;
    },
  }),
  summarize: (_i, out) => (out ? `${out.title}: ${out.feedback}` : undefined),
};
