"use client";
import { useState, type FormEvent } from "react";
import { SendHorizontal } from "lucide-react";
import styles from "./Chat.module.css";

export function Composer(props: {
  disabled?: boolean;
  placeholder?: string;
  meta?: React.ReactNode;
  onSend: (text: string) => void;
  /** Chamado a cada tecla com texto no campo (quem usa decide o ritmo do aviso "digitando"). */
  onTyping?: () => void;
}) {
  const [text, setText] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || props.disabled) return;
    props.onSend(value);
    setText("");
  }

  return (
    <form className={styles.composerArea} onSubmit={submit}>
      <div className={styles.composer}>
        <input
          aria-label="Mensagem"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) props.onTyping?.();
          }}
          placeholder={props.placeholder ?? "Escreva para o Nexo…"}
          disabled={props.disabled}
          autoFocus
        />
        <button type="submit" className={styles.send} disabled={props.disabled || !text.trim()}>
          <SendHorizontal size={14} aria-hidden />
          Enviar
        </button>
      </div>
      {props.meta && <div className={styles.meta}>{props.meta}</div>}
    </form>
  );
}
