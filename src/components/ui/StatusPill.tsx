export type Tone = "success" | "warning" | "primary" | "danger" | "neutral";

const TONES: Record<Tone, { bg: string; dot: string; text: string }> = {
  success: { bg: "var(--success-soft)", dot: "var(--success)", text: "var(--success-text)" },
  warning: { bg: "var(--warning-soft)", dot: "var(--warning)", text: "var(--warning-text)" },
  primary: { bg: "var(--primary-soft)", dot: "var(--primary)", text: "var(--primary-text)" },
  danger: { bg: "var(--danger-soft)", dot: "var(--danger)", text: "var(--danger-text)" },
  neutral: { bg: "var(--desk)", dot: "var(--ink-3)", text: "var(--ink-2)" },
};

/** Pílula de status com ponto colorido (ex.: "Assistente online"). */
export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const t = TONES[tone];
  return (
    <span
      role="status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 10px",
        borderRadius: 999,
        background: t.bg,
        color: t.text,
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: t.dot }} />
      {label}
    </span>
  );
}
