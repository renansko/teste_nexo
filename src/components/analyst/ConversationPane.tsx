"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft, Bot, Check, ChevronDown, CircleCheck, Headset, Info, LoaderCircle, PanelRight, SendHorizontal, Undo2, UserRoundCheck, X,
} from "lucide-react";
import type { AnalystConversationDetail, ChatMessage, SessionUser } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { initialsOf } from "@/components/session/SessionProvider";
import { DecisionDetails, hasDetails } from "@/components/trace/DecisionDetails";
import traceStyles from "@/components/trace/Trace.module.css";
import { avatarColors, dayLabel, firstName, hhmm, payloadSummary, reasonLabel } from "./labels";
import styles from "./Console.module.css";

export type PaneAction = "take" | "giveBack" | "close";

interface Props {
  me: SessionUser;
  detail: AnalystConversationDetail | undefined;
  loading: boolean;
  error?: string;
  busy?: PaneAction | "reply";
  ticketsOpen: boolean;
  onToggleTickets: () => void;
  onBack: () => void;
  onAction: (a: PaneAction) => void;
  onReply: (text: string) => Promise<boolean>;
}

/** Coluna da conversa: cabeçalho com estado/ações, histórico com o raciocínio do agent e barra de atendimento. */
export function ConversationPane({ me, detail, loading, error, busy, ticketsOpen, onToggleTickets, onBack, onAction, onReply }: Props) {
  if (!detail) {
    return (
      <section className={styles.pane} aria-label="Conversa">
        <div className={styles.paneEmpty}>
          {loading ? (
            <p>Carregando conversa…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : (
            <div>
              <h2>Selecione uma conversa</h2>
              <p>Comece por &quot;Para você&quot;: são as conversas que o agent transferiu e esperam um atendente.</p>
            </div>
          )}
        </div>
      </section>
    );
  }

  const c = detail.conversation;
  const name = c.employee?.name ?? "Funcionário";
  const mine = c.state === "analyst" && c.analystId === me.id;
  const meta = [c.employee?.department, c.employee?.email, c.ticketId].filter(Boolean).join(" · ");

  return (
    <section className={styles.pane} aria-label={`Conversa com ${name}`}>
      <header className={styles.header}>
        <button type="button" className={`${styles.iconBtn} ${styles.backBtn}`} onClick={onBack} aria-label="Voltar para a lista">
          <ArrowLeft size={18} aria-hidden />
        </button>
        <span className={styles.avatar} style={{ ...avatarColors(c.employeeId), width: 40, height: 40, fontSize: 14.5 }} aria-hidden>
          {initialsOf(name)}
        </span>
        <div className={styles.who}>
          <strong>{name}</strong>
          <span>{meta}</span>
        </div>
        {mine ? (
          <>
            <button type="button" className={styles.btn} disabled={!!busy} onClick={() => onAction("giveBack")}>
              <Undo2 size={14} aria-hidden />
              <span className={styles.headerActionLabel}>Devolver ao agent</span>
            </button>
            <button type="button" className={styles.btnDanger} disabled={!!busy} onClick={() => onAction("close")}>
              <CircleCheck size={14} aria-hidden />
              <span className={styles.headerActionLabel}>Encerrar atendimento</span>
            </button>
          </>
        ) : (
          <ModePill state={c.state} analystName={c.analyst?.name} />
        )}
        {!ticketsOpen && (
          <button type="button" className={styles.iconBtn} onClick={onToggleTickets} aria-label={`Ver chamados de ${firstName(name)}`}>
            <PanelRight size={18} aria-hidden />
          </button>
        )}
      </header>

      {c.transferSummary && c.state !== "closed" && (
        <div className={styles.transfer}>
          <Info size={15} aria-hidden />
          <div>
            <strong>
              {c.state === "agent" ? "Já passou por um analista" : `Transferida: ${reasonLabel(c.transferReason)}`}
            </strong>
            {" · "}
            {c.transferSummary}
          </div>
        </div>
      )}

      <History detail={detail} me={me} />

      <Dock detail={detail} mine={mine} busy={busy} error={error} onAction={onAction} onReply={onReply} />
    </section>
  );
}

function ModePill({ state, analystName }: { state: AnalystConversationDetail["conversation"]["state"]; analystName?: string }) {
  if (state === "waiting_analyst")
    return (
      <span className={styles.mode} data-tone="warning">
        <Headset size={14} aria-hidden />
        Aguardando atendente
      </span>
    );
  if (state === "agent")
    return (
      <span className={styles.mode} data-tone="success">
        <Bot size={14} aria-hidden />
        Com o agent
      </span>
    );
  if (state === "analyst")
    return (
      <span className={styles.mode} data-tone="primary">
        <UserRoundCheck size={14} aria-hidden />
        Com {analystName ?? "outro analista"}
      </span>
    );
  return (
    <span className={styles.mode} data-tone="muted">
      Encerrada
    </span>
  );
}

function History({ detail, me }: { detail: AnalystConversationDetail; me: SessionUser }) {
  const endRef = useRef<HTMLDivElement>(null);
  const count = detail.messages.length;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count, detail.conversation.id]);

  const c = detail.conversation;
  const analystName = c.state === "analyst" ? (c.analystId === me.id ? "Você" : c.analyst?.name) : undefined;
  const rows: React.ReactNode[] = [];
  let lastDay = "";
  let prev: ChatMessage | undefined;
  for (const m of detail.messages) {
    const day = dayLabel(m.createdAt);
    if (day !== lastDay) {
      rows.push(
        <span key={`d-${m.id}`} className={styles.day}>
          {day}
        </span>,
      );
      lastDay = day;
      prev = undefined;
    }
    const grouped = prev?.role === m.role && m.role !== "system";
    rows.push(<Row key={m.id} m={m} grouped={grouped} analystName={analystName ?? "Analista"} />);
    prev = m;
  }

  return (
    <div className={styles.scroll}>
      <div className={styles.messages} aria-live="polite">
        {rows.length === 0 && <span className={styles.day}>Sem mensagens</span>}
        {rows}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function Row({ m, grouped, analystName }: { m: ChatMessage; grouped: boolean; analystName: string }) {
  if (m.role === "system")
    return (
      <p className={styles.system}>
        <span>
          <Info size={13} aria-hidden />
          {m.content} · {hhmm(m.createdAt)}
        </span>
      </p>
    );
  if (m.role === "user")
    return (
      <div className={styles.client} data-grouped={grouped}>
        <div className={styles.bubble}>
          <span className={styles.bubbleText}>{m.content}</span>
          <time className={styles.bubbleMeta} dateTime={m.createdAt}>
            {hhmm(m.createdAt)}
          </time>
        </div>
      </div>
    );
  const human = m.role === "analyst";
  return (
    <div className={styles.right} data-kind={human ? "human" : "agent"} data-grouped={grouped}>
      {!grouped && (
        <span className={styles.sender}>
          {human ? analystName : "Nexo Assist"}
          <span className={styles.senderTag} data-kind={human ? "human" : "agent"}>
            {human ? "Suporte" : "IA"}
          </span>
        </span>
      )}
      {!human && <AgentTrace m={m} />}
      <div className={styles.bubble}>
        {m.content && <span className={styles.bubbleText}>{m.content}</span>}
        {m.payload && m.payload.length > 0 && (
          <ul className={styles.cards}>
            {payloadSummary(m.payload).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
        <time className={styles.bubbleMeta} dateTime={m.createdAt}>
          {hhmm(m.createdAt)}
        </time>
      </div>
    </div>
  );
}

/** Passos do agent acima da resposta + detalhe técnico da decisão (abre sozinho quando a segurança foi baixa). */
function AgentTrace({ m }: { m: ChatMessage }) {
  const trace = m.trace;
  const [open, setOpen] = useState(trace?.decision?.confidence === "baixa");
  const id = useId();
  if (!hasDetails(trace)) return null;
  return (
    <>
      <div className={styles.steps}>
        {trace.actions.map((a) => (
          <span key={a.id} className={styles.step} data-status={a.status} title={a.summary}>
            {a.status === "pending" ? <LoaderCircle size={12} aria-hidden /> : a.status === "error" ? <X size={12} aria-hidden /> : <Check size={12} aria-hidden />}
            {a.label}
          </span>
        ))}
        <button type="button" className={traceStyles.toggle} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          {open ? "Ocultar raciocínio" : "Ver raciocínio"}
          <ChevronDown size={13} aria-hidden />
        </button>
      </div>
      {open && <DecisionDetails trace={trace} technical id={id} />}
    </>
  );
}

function Dock({
  detail, mine, busy, error, onAction, onReply,
}: {
  detail: AnalystConversationDetail;
  mine: boolean;
  busy?: PaneAction | "reply";
  error?: string;
  onAction: (a: PaneAction) => void;
  onReply: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const c = detail.conversation;
  const first = firstName(c.employee?.name) || "O funcionário";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    if (await onReply(value)) setText("");
  }

  const banner = error && (
    <p className={styles.error} role="alert">
      {error}
    </p>
  );

  if (mine)
    return (
      <form className={styles.dock} onSubmit={submit}>
        {banner}
        <div className={styles.composer}>
          <input
            aria-label={`Responder a ${first}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Responder a ${first}…`}
            maxLength={4000}
            autoFocus
          />
          <button type="submit" className={styles.send} disabled={!text.trim() || !!busy} aria-label="Enviar">
            {busy === "reply" ? <LoaderCircle size={18} aria-hidden /> : <SendHorizontal size={18} aria-hidden />}
          </button>
        </div>
      </form>
    );

  const locked = (placeholder: string) => (
    <div className={styles.composer}>
      <input aria-label="Resposta" disabled placeholder={placeholder} />
    </div>
  );

  if (c.state === "closed")
    return (
      <div className={styles.dock}>
        {banner}
        {locked("Conversa encerrada")}
      </div>
    );

  if (c.state === "analyst")
    return (
      <div className={styles.dock}>
        {banner}
        {locked(`${c.analyst?.name ?? "Outro analista"} está atendendo esta conversa`)}
      </div>
    );

  const waiting = c.state === "waiting_analyst";
  return (
    <div className={styles.dock}>
      {banner}
      <div className={styles.dockRow}>
        <span className={styles.dockIcon} data-tone={waiting ? undefined : "success"} aria-hidden>
          {waiting ? <Headset size={17} /> : <Bot size={17} />}
        </span>
        <div className={styles.dockText}>
          <strong>{waiting ? `${first} espera um atendente` : "O Nexo Assist está atendendo"}</strong>
          <span>
            {waiting
              ? `Agent pausado${c.waitingSince ? ` · na fila ${formatRelative(c.waitingSince)}` : ""}`
              : "Você pode assumir a qualquer momento; o agent fica em pausa."}
          </span>
        </div>
        {waiting && (
          <button type="button" className={styles.btn} disabled={!!busy} onClick={() => onAction("giveBack")}>
            <Undo2 size={15} aria-hidden />
            {busy === "giveBack" ? "Devolvendo…" : "Devolver ao agent"}
          </button>
        )}
        <button type="button" className={styles.btnPrimary} disabled={!!busy} onClick={() => onAction("take")}>
          <UserRoundCheck size={16} aria-hidden />
          {busy === "take" ? "Assumindo…" : "Assumir atendimento"}
        </button>
      </div>
      {locked("Assuma o atendimento para responder")}
    </div>
  );
}
