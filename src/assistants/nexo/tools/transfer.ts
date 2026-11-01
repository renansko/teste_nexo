import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { ToolSpec } from "@/engine/types";

export const TRANSFER_REASONS = {
  user_request: "o funcionário pediu para falar com um analista",
  critical: "caso crítico (algo parado para uma equipe ou para a empresa)",
  overdue: "chamado vencido",
  low_confidence: "o agent não teve segurança para decidir",
} as const;

type Input = { reason: keyof typeof TRANSFER_REASONS; summary: string };

export const transferToAnalyst: ToolSpec<Input, { ok: true }> = {
  label: "transferiu para um analista",
  tool: createTool({
    id: "transfer-to-analyst",
    description: "Transfere a conversa para um analista humano. Use quando o funcionário pedir, em casos críticos, em chamado vencido ou quando não tiver segurança sobre o que fazer. O resumo deve dar contexto suficiente para o analista não perguntar tudo de novo. Depois de chamar, avise que um analista vai assumir e que você fica em pausa.",
    inputSchema: z.object({
      reason: z.enum(["user_request", "critical", "overdue", "low_confidence"]),
      summary: z.string().min(10).describe("Resumo do caso: quem, o que acontece, o que já foi tentado, chamados relacionados"),
    }),
    execute: async () => ({ ok: true as const }),
  }),
  summarize: (i) => TRANSFER_REASONS[i.reason],
  afterEffects: (i) => [{ type: "transfer", reason: i.reason, label: TRANSFER_REASONS[i.reason], summary: i.summary }],
};
