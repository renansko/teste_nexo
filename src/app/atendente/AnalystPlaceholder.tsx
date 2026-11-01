"use client";
import { SessionProvider, useSession } from "@/components/session/SessionProvider";

function Body() {
  const { user, logout } = useSession();
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: 16, textAlign: "center" }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 32, margin: "0 0 8px" }}>
          Olá, {user.name.split(" ")[0]}
        </h1>
        <p style={{ color: "var(--ink-3)", margin: "0 0 20px" }}>O console do analista ainda está em construção.</p>
        <button
          type="button"
          onClick={() => void logout()}
          style={{ height: 36, padding: "0 14px", border: "1px solid var(--line-soft)", borderRadius: 8, background: "var(--paper)" }}
        >
          Sair
        </button>
      </div>
    </main>
  );
}

export function AnalystPlaceholder() {
  return (
    <SessionProvider role="analyst">
      <Body />
    </SessionProvider>
  );
}
