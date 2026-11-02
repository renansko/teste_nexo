"use client";
/**
 * "Resolver chamado": o analista escreve a solução em texto; o backend marca o chamado como resolvido
 * e guarda a solução como memória que o assistente passa a encontrar na central de ajuda.
 * Regras do campo espelham `POST /api/analyst/tickets/:id/resolve` (10 a 2000 caracteres).
 * @wiki docs/brain/conventions/FrontendUI.md
 */
import { useEffect, useState } from "react";
import { analystApi, ApiError, type TicketView } from "@/lib/api";
import { Dialog } from "@/components/ui/Dialog";
import styles from "@/components/ui/Dialog.module.css";

const MIN = 10;
const MAX = 2000;

const ERRORS: Record<string, string> = {
  TICKET_NOT_OPEN: "Este chamado já não está aberto. Feche e abra o painel de novo para ver o estado atual.",
  NOT_FOUND: "Chamado não encontrado no sistema de chamados.",
  LEGACY_UNAVAILABLE: "O sistema de chamados está indisponível no momento. Tente de novo em instantes.",
};

export function ResolveTicketDialog({
  ticket,
  onResolved,
  onClose,
}: {
  /** Chamado a resolver; `null` fecha o diálogo. */
  ticket: TicketView | null;
  onResolved: (ticket: TicketView) => void;
  onClose: () => void;
}) {
  const [solution, setSolution] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const open = ticket !== null;

  // Cada chamado começa com o campo limpo.
  useEffect(() => {
    setSolution("");
    setError(undefined);
  }, [ticket?.id]);

  const trimmed = solution.trim();
  const tooShort = trimmed.length < MIN;
  const tooLong = trimmed.length > MAX;

  async function submit() {
    if (!ticket || busy || tooShort || tooLong) return;
    setBusy(true);
    setError(undefined);
    try {
      const { ticket: resolved } = await analystApi.resolveTicket(ticket.id, trimmed);
      onResolved(resolved);
    } catch (e) {
      const code = e instanceof ApiError ? (e.status === 503 ? "LEGACY_UNAVAILABLE" : e.code) : "";
      setError(ERRORS[code] ?? (e instanceof ApiError ? e.message : "Não foi possível resolver o chamado. Tente de novo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={ticket ? `Resolver ${ticket.id}` : "Resolver chamado"}
      description={
        ticket ? (
          <>
            <strong>{ticket.title}</strong>. Descreva o que resolveu o problema: o chamado fica como resolvido e a solução passa a ser
            sugerida pelo assistente em casos parecidos.
          </>
        ) : undefined
      }
      busy={busy}
      onClose={onClose}
      actions={
        <>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button type="button" className={styles.btn} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" form="resolve-ticket-form" className={styles.btnPrimary} disabled={busy || tooShort || tooLong}>
            {busy ? "Resolvendo…" : "Resolver chamado"}
          </button>
        </>
      }
    >
      <form
        id="resolve-ticket-form"
        className={styles.field}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="resolve-ticket-solution">Solução aplicada</label>
        <textarea
          id="resolve-ticket-solution"
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          disabled={busy}
          maxLength={MAX + 200}
          placeholder="Ex.: Trocado o cabo de energia do notebook; o anterior estava rompido perto do conector."
          autoFocus
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void submit();
          }}
        />
        <p className={styles.hint} data-invalid={tooLong}>
          <span>Ctrl+Enter para resolver</span>
          <span>
            {trimmed.length < MIN ? `mínimo ${MIN} caracteres` : `${trimmed.length}/${MAX}`}
          </span>
        </p>
      </form>
    </Dialog>
  );
}
