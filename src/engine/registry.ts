/**
 * Registro de personas. Hoje só "nexo"; o seam para multi-tenant é trocar este mapa por uma tabela.
 * @wiki docs/brain/services/AssistantConfig.md
 */
import type { AssistantConfig } from "./types";
import { AppError } from "@/lib/errors";
import { nexoAssistant } from "@/assistants/nexo/persona";

const assistants: Record<string, AssistantConfig> = { [nexoAssistant.id]: nexoAssistant };

export function getAssistant(id: string): AssistantConfig {
  const a = assistants[id];
  if (!a) throw new AppError("ASSISTANT_NOT_FOUND", `Assistente '${id}' não existe`, 404);
  return a;
}

export const listAssistants = (): AssistantConfig[] => Object.values(assistants);
