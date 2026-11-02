"use client";
import { useState } from "react";
import { SendHorizontal } from "lucide-react";
import styles from "./Chat.module.css";

export function Composer(props: {
  disabled?: boolean;
  placeholder?: string;
  meta?: React.ReactNode;
  onSend: (text: string) => void;
  /** Chamado a cada tecla com texto no campo (quem usa decide o ritmo do aviso "digitando"). */
  onTyping?: () => void;
  /** Mesma regra do servidor (política da persona): devolve a dica quando o texto não deve ser enviado. */
  validate?: (text: string) => string | undefined;
}) {
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const problem = text.trim() ? props.validate?.(text) : undefined;

  function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    const value = text.trim();
    if (!value || props.disabled) return;
    if (problem) {
      setTouched(true);
      return;
    }
    props.onSend(value);
    setText("");
    setTouched(false);
  }

  return (
    <form className={styles.composerArea} onSubmit={submit}>
      <div className={styles.composer}>
        <input
          aria-label="Mensagem"
          aria-invalid={touched && !!problem}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) props.onTyping?.();
          }}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            // Enter já envia (submit implícito); Ctrl/Cmd+Enter também, porque o modificador cancela o submit do navegador.
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e);
          }}
          placeholder={props.placeholder ?? "Escreva para o Nexo…"}
          disabled={props.disabled}
          autoFocus
        />
        <button type="submit" className={styles.send} disabled={props.disabled || !text.trim() || !!problem}>
          <SendHorizontal size={14} aria-hidden />
          Enviar
        </button>
      </div>
      {touched && problem && (
        <p role="status" className={styles.hint}>
          {problem}
        </p>
      )}
      {props.meta && <div className={styles.meta}>{props.meta}</div>}
    </form>
  );
}
