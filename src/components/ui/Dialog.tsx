"use client";
/**
 * Diálogo modal do produto (substitui `window.confirm`/`prompt`): `<dialog>` nativo com `showModal()`
 * (foco preso, Esc fecha, fundo escurecido) e visual dos tokens do `globals.css`.
 * Conteúdo e ações vêm de quem usa e só são montados com `open` (fechado, o `<dialog>` fica vazio e invisível);
 * `ConfirmDialog` é o caso simples de confirmação.
 * @wiki docs/brain/conventions/FrontendUI.md
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./Dialog.module.css";

export function Dialog({
  open,
  title,
  description,
  tone = "neutral",
  busy = false,
  onClose,
  children,
  actions,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** Muda a cor do ícone/título; "danger" para ações que fecham ou encerram. */
  tone?: "neutral" | "danger";
  /** Enquanto `busy`, Esc e o X não fecham (a ação em curso decide). */
  busy?: boolean;
  onClose: () => void;
  children?: ReactNode;
  actions: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      data-tone={tone}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        // Clique no backdrop (fora da caixa) fecha; dentro, não.
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      {open && (
        <div className={styles.box}>
          <header className={styles.head}>
            <h2 id={titleId}>{title}</h2>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              disabled={busy}
              aria-label="Fechar"
            >
              <X size={18} aria-hidden />
            </button>
          </header>
          {description && (
            <p id={descId} className={styles.description}>
              {description}
            </p>
          )}
          {children && <div className={styles.body}>{children}</div>}
          <footer className={styles.actions}>{actions}</footer>
        </div>
      )}
    </dialog>
  );
}

/** Confirmação simples: pergunta, botão de confirmar (primário ou de perigo) e cancelar. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "neutral",
  busy = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "neutral" | "danger";
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      tone={tone}
      busy={busy}
      onClose={onClose}
      actions={
        <>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className={styles.btn}
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={tone === "danger" ? styles.btnDanger : styles.btnPrimary}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? "Aguarde…" : confirmLabel}
          </button>
        </>
      }
    />
  );
}
