import { SessionProvider } from "@/components/session/SessionProvider";
import { AnalystConsole } from "@/components/analyst/AnalystConsole";

export const metadata = { title: "Conversas · Nexo Assist" };

/** Console do analista (protótipo "Atendente — Conversas" e "Atendente — Atendimento assumido"). */
export default function AtendentePage() {
  return (
    <SessionProvider role="analyst">
      <AnalystConsole />
    </SessionProvider>
  );
}
