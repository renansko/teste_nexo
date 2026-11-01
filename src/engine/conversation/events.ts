/**
 * Eventos emitidos durante um turno. Mesmos nomes no SSE (`event:`) e no modo JSON.
 * @wiki docs/brain/functions/ChatApi.md
 */
import type { Message } from "@/services/conversations/conversationService";
import type { PayloadPart, Trace, TraceAction } from "../types";
import type { PublicConversation } from "./view";

export type ChatEvent =
  | { type: "message.start" }
  | { type: "action"; action: TraceAction }
  | { type: "text.delta"; delta: string }
  | { type: "payload"; part: PayloadPart }
  | { type: "trace"; trace: Trace }
  | { type: "conversation"; conversation: PublicConversation }
  | { type: "message.end"; message: Message }
  | { type: "error"; code: string; message: string };

export type Emit = (e: ChatEvent) => void;

/** Codifica um evento no formato text/event-stream. */
export function encodeSse(e: ChatEvent): string {
  const { type, ...data } = e;
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}
