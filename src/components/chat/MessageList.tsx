"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, MessageCircleQuestion, X } from "lucide-react";
import type { ChatMessage, Option, TicketView, Trace, TraceAction } from "@/lib/api";
import { DecisionDetails, hasDetails } from "@/components/trace/DecisionDetails";
import traceStyles from "@/components/trace/Trace.module.css";
import { looseOptions, OptionChips, PayloadCards } from "./payload/Payload";
import { RichText } from "./RichText";
import styles from "./Chat.module.css";

const AUTHOR = { agent: "Nexo Assist", analyst: "Analista" } as const;

interface Props {
  messages: ChatMessage[];
  /** Turno do agent em andamento (SSE): ações e texto parciais. */
  streaming?: { actions: TraceAction[]; text: string } | null;
  /** A última mensagem do agent aceita clique em opções/chamados. */
  interactive: boolean;
  onOption: (option: Option) => void;
  onPickTicket: (ticket: TicketView) => void;
}

/** Lista de mensagens do chat do funcionário. */
export function MessageList({ messages, streaming, interactive, onOption, onPickTicket }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const streamLen = (streaming?.text.length ?? 0) + (streaming?.actions.length ?? 0);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streamLen]);

  const lastAgentId = [...messages].reverse().find((m) => m.role === "agent")?.id;
  const lastId = messages.at(-1)?.id;

  return (
    <div className={styles.scroll} aria-live="polite">
      <div className={styles.messages}>
        {messages.length === 0 && !streaming && (
          <div className={styles.empty}>
            <h2>Como podemos ajudar?</h2>
            <p>Descreva o problema de TI. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa.</p>
          </div>
        )}
        {messages.map((m) => {
          if (m.role === "user")
            return (
              <div key={m.id} className={styles.userRow}>
                <div className={styles.userBubble}>{m.content}</div>
              </div>
            );
          if (m.role === "system")
            return (
              <p key={m.id} className={styles.system}>
                {m.content}
              </p>
            );
          const parts = m.payload ?? [];
          const live = interactive && m.id === lastAgentId && m.id === lastId;
          const handlers = { interactive: live, onOption, onPickTicket };
          const chips = looseOptions(parts);
          return (
            <AgentMessage key={m.id} who={AUTHOR[m.role]} analyst={m.role === "analyst"} actions={m.trace?.actions} trace={m.trace}>
              {(m.content || chips) && (
                <div className={styles.agentBubble}>
                  {m.content && <RichText className={styles.text} text={m.content} />}
                  {chips && <OptionChips options={chips} {...handlers} />}
                </div>
              )}
              <PayloadCards parts={parts} {...handlers} />
            </AgentMessage>
          );
        })}
        {streaming && (
          <AgentMessage who="Nexo Assist" actions={streaming.actions} live>
            <div className={styles.agentBubble}>
              {streaming.text ? (
                <RichText className={styles.text} text={streaming.text} />
              ) : (
                <span className={styles.typing} aria-label="Nexo Assist está escrevendo">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </div>
          </AgentMessage>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/**
 * `live`: turno em andamento (SSE), onde `pending` significa "executando" (spinner). Numa mensagem gravada,
 * `pending` é uma tool que parou para perguntar ao funcionário: ícone estático de pergunta.
 * `trace`: decisão gravada; quando tem detalhes, mostra o "Por quê?".
 */
function AgentMessage(props: {
  who: string;
  analyst?: boolean;
  actions?: TraceAction[];
  trace?: Trace | null;
  live?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const details = hasDetails(props.trace) ? props.trace : null;
  return (
    <div className={styles.agentRow}>
      <div className={styles.statusLine}>
        <span className={styles.who} data-analyst={props.analyst}>
          {props.who}
        </span>
        {props.actions?.map((a) => (
          <span key={a.id} className={styles.step} data-status={a.status} title={a.summary}>
            {a.status === "pending" ? (
              props.live ? (
                <LoaderCircle size={12} className={styles.spin} aria-hidden />
              ) : (
                <MessageCircleQuestion size={12} aria-hidden />
              )
            ) : a.status === "error" ? (
              <X size={12} aria-hidden />
            ) : (
              <Check size={12} aria-hidden />
            )}
            {a.label}
          </span>
        ))}
        {details && (
          <button
            type="button"
            className={traceStyles.toggle}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Ocultar detalhes" : "Por quê?"}
            <ChevronDown size={13} aria-hidden />
          </button>
        )}
      </div>
      {details && open && <DecisionDetails trace={details} id={panelId} />}
      {props.children}
    </div>
  );
}
