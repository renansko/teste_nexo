export function Avatar({ initials, size = 34 }: { initials: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        background: "var(--primary-soft)",
        color: "var(--primary-text)",
        fontSize: size >= 34 ? 12.5 : 11.5,
        fontWeight: 700,
      }}
    >
      {initials}
    </span>
  );
}
