/**
 * Presença "digitando…" entre funcionário e analista. Efêmera e em memória (por processo): não é estado da
 * conversa, expira sozinha pelo TTL e perdê-la num reinício não tem custo. Quem digita avisa (POST typing) a cada
 * ~1,5 s; o outro lado lê no polling que já faz. Com mais de uma instância seria um store compartilhado (Redis).
 * @wiki docs/brain/entities/Conversation.md
 */
export type TypingRole = "employee" | "analyst";

/** Janela em que um aviso vale; maior que o intervalo de reenvio do cliente, menor que o esquecimento aceitável. */
export const TYPING_TTL_MS = 4000;

const until = new Map<string, number>();
const key = (conversationId: string, role: TypingRole) => `${conversationId}:${role}`;

export function markTyping(conversationId: string, role: TypingRole, now = Date.now()): void {
  until.set(key(conversationId, role), now + TYPING_TTL_MS);
  if (until.size > 1000) prune(now);
}

/** Mensagem enviada: quem a mandou já não está digitando. */
export function clearTyping(conversationId: string, role: TypingRole): void {
  until.delete(key(conversationId, role));
}

export function typingState(conversationId: string, now = Date.now()): Record<TypingRole, boolean> {
  const live = (role: TypingRole) => (until.get(key(conversationId, role)) ?? 0) > now;
  return { employee: live("employee"), analyst: live("analyst") };
}

function prune(now: number): void {
  for (const [k, t] of until) if (t <= now) until.delete(k);
}
