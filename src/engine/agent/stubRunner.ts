/**
 * Runner determinístico no lugar do modelo (`NEXO_MODEL=stub/...`): decide por palavras-chave, chama as mesmas tools
 * embrulhadas que o modelo chamaria e sempre registra `report-decision`. Sem rede, sem chave, custo zero.
 * Uso: teste de carga (`npm run load`) e demonstração sem provedor. Não tenta imitar a qualidade do modelo:
 * o que importa é exercitar o engine, as tools, o banco e o SSE com o mesmo caminho de código da produção.
 * Nunca suspende a run (não chama tools HITL); numa retomada só encerra a pergunta pendente.
 * @wiki docs/brain/conventions/LoadTesting.md
 */
import type { AgentRunner, AgentRunParams } from "./types";

type ToolCall = (id: string, input: Record<string, unknown>) => Promise<unknown>;

const TICKET_WORDS = /\bchamad|\bincidente|\bstatus\b|\binc-\d|\breq-\d/i;
const HELP_WORDS = /\bvpn\b|\berro\b|\bsenha\b|\boutlook\b|\bimpressora\b|\bwi-?fi\b|\bacesso\b|\bnão (abre|funciona|conecta)/i;

async function callTool(p: AgentRunParams, id: string, input: Record<string, unknown>): Promise<unknown> {
  const t = p.tools[id];
  if (!t?.execute) throw new Error(`stub: tool ${id} não disponível`);
  // Mesmo contrato que o Mastra 1.x passa às tools; `suspend` nunca é chamado pelas tools que o stub usa.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return t.execute(input, { requestContext: p.requestContext, agent: { agentId: p.config.id, toolCallId: `stub-${Date.now()}`, suspend: async () => {} } } as any);
}

const hasError = (r: unknown): r is { error: string; message?: string } => typeof r === "object" && r !== null && "error" in r;

async function decide(text: string, tool: ToolCall): Promise<{ text: string; action: string }> {
  if (TICKET_WORDS.test(text)) {
    const r = await tool("list-my-tickets", { status: "open" });
    if (hasError(r)) return { text: "O sistema de chamados está instável agora. Tento de novo em instantes ou posso chamar um analista.", action: "tentou listar os chamados; legado indisponível" };
    const n = Array.isArray(r) ? r.length : 0;
    return { text: n ? `Você tem ${n} chamado(s) em aberto. Quer complementar algum deles?` : "Você não tem chamados em aberto. Quer abrir um?", action: "listou os chamados abertos" };
  }
  if (HELP_WORDS.test(text)) {
    const hits = await tool("search-help-center", { query: text.slice(0, 80) });
    const first = Array.isArray(hits) ? (hits[0] as { id?: string } | undefined) : undefined;
    if (first?.id) {
      await tool("cite-articles", { ids: [first.id] });
      return { text: "Encontrei um artigo da central que trata disso. Dá uma olhada e me diga se resolveu.", action: "citou um artigo da central" };
    }
    return { text: "Não achei nada na central sobre isso. Quer abrir um chamado?", action: "buscou na central sem resultado" };
  }
  return { text: "Entendi. Me conte um pouco mais: o que acontece e desde quando?", action: "pediu detalhes" };
}

export function createStubRunner(): AgentRunner {
  return async (p) => {
    const tool: ToolCall = (id, input) => callTool(p, id, input);
    const last = p.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    const { text, action } = p.resume
      ? { text: "Certo, seguimos daqui. Se precisar, é só dizer.", action: "encerrou a pergunta pendente" }
      : await decide(last, tool);
    await tool("report-decision", { understanding: `mensagem: "${last.slice(0, 60)}"`, action, confidence: "alta", reasoning: "runner stub: decisão por palavras-chave, sem modelo" });
    p.onTextDelta(text);
    return { text, model: p.config.model, finishReason: "stop" };
  };
}
