import { ClientSidebar } from "@/components/client/ClientSidebar";
import { SessionProvider } from "@/components/session/SessionProvider";

/** Shell do funcionário: sidebar fixa + área principal (protótipo, telas "Chat" e "Meu perfil"). */
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider role="employee">
      <div style={{ display: "flex", height: "100dvh", background: "var(--paper)" }}>
        <ClientSidebar />
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</main>
      </div>
    </SessionProvider>
  );
}
