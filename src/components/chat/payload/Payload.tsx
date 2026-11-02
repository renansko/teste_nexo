"use client";
import type { Article, DraftTicket, Option, PayloadPart, TicketUpdate, TicketView } from "@/lib/api";
import { formatDateTime, formatDay, formatRelative } from "@/lib/format";
import { PRIORITY_DOT, statusDot } from "./tones";
import styles from "./Payload.module.css";

export interface PayloadHandlers {
  /** `false` quando a mensagem não é a última do agent ou a conversa não aceita entrada. */
  interactive: boolean;
  onOption: (option: Option) => void;
  onPickTicket: (ticket: TicketView) => void;
}

/** Opções soltas, exibidas dentro do balão (ex.: "Quem está sendo afetado?"). */
export function looseOptions(parts: PayloadPart[]): Option[] | null {
  if (parts.some((p) => p.kind === "draft")) return null; // vão para a barra do rascunho
  const opt = parts.find((p) => p.kind === "options");
  return opt?.kind === "options" ? opt.data : null;
}

/** Cards estruturados que ficam abaixo do balão. */
export function PayloadCards({ parts, ...h }: { parts: PayloadPart[] } & PayloadHandlers) {
  const options = parts.find((p) => p.kind === "options")?.data as Option[] | undefined;
  return (
    <>
      {parts.map((p, i) => {
        switch (p.kind) {
          case "draft":
            return <DraftCard key={i} draft={p.data} options={options ?? []} {...h} />;
          case "tickets":
            return <TicketSelector key={i} tickets={p.data} {...h} />;
          case "ticket":
            return <TicketCard key={i} ticket={p.data.ticket} updates={p.data.updates} />;
          case "articles":
            return <ArticleList key={i} articles={p.data} />;
          default:
            return null;
        }
      })}
    </>
  );
}

export function OptionChips({ options, interactive, onOption }: { options: Option[] } & Pick<PayloadHandlers, "interactive" | "onOption">) {
  return (
    <div className={styles.options} role="group" aria-label="Respostas rápidas">
      {options.map((o) => (
        <button key={o.id} type="button" className={styles.chip} disabled={!interactive} onClick={() => onOption(o)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Eyebrow({ kind, id, dot, label, labelColor }: { kind: string; id: string; dot: string; label: string; labelColor: string }) {
  return (
    <div className={styles.eyebrow}>
      <span>{kind}</span>
      <i className={styles.sep} aria-hidden />
      <span className={styles.eyebrowId}>{id}</span>
      <span className={styles.spacer} />
      <span className={styles.state} style={{ color: labelColor }}>
        <i style={{ background: dot }} aria-hidden />
        {label}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldKey}>{label}</span>
      <span className={styles.fieldValue}>{children}</span>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <i className={styles.dot} style={{ background: color }} aria-hidden />;
}

/** Ids do rascunho: `confirm`, `edit:<campo>`, `cancel`. */
function optionStyle(id: string): string | undefined {
  if (id === "confirm") return styles.btnPrimary;
  if (id === "cancel") return styles.btnGhost;
  return styles.btnSecondary;
}

const DRAFT_KIND: Record<DraftTicket["mode"], string> = {
  create: "Novo chamado",
  update: "Atualizar chamado",
  reopen: "Reabrir chamado",
};

function dueTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function DraftCard({ draft, options, interactive, onOption }: { draft: DraftTicket; options: Option[] } & PayloadHandlers) {
  // Rascunhos antigos (já gravados no histórico) podem não trazer prazo: sem prazo válido, não mostra a linha.
  const validDue = !!draft.dueAt && !Number.isNaN(new Date(draft.dueAt).getTime());
  const sameDay = validDue && new Date(draft.dueAt).toDateString() === new Date().toDateString();
  const due = !validDue ? null : sameDay ? `resposta até ${dueTime(draft.dueAt)}` : `resposta até ${formatDateTime(draft.dueAt)}`;
  return (
    <article className={styles.card} aria-label="Rascunho do chamado">
      <div className={styles.body}>
        <Eyebrow
          kind={DRAFT_KIND[draft.mode]}
          id={draft.ticket ? draft.ticket.id : `Rascunho · ${draft.typeLabel}`}
          dot="var(--warning)"
          label={interactive ? "Aguardando confirmação" : "Rascunho"}
          labelColor="var(--warning-text)"
        />
        <h3 className={styles.title}>{draft.title}</h3>
        <p className={styles.description}>{draft.text ?? draft.description}</p>
      </div>
      <div className={styles.fields}>
        <Field label="Categoria">{draft.category}</Field>
        <Field label="Prioridade">
          <Dot color={PRIORITY_DOT[draft.priority]} />
          {draft.priorityLabel}
          {due && <span className={styles.muted}>· {due}</span>}
        </Field>
        <Field label="Afetados">{draft.affected || "—"}</Field>
      </div>
      {draft.priorityReason && <p className={styles.related}>{draft.priorityReason}</p>}
      {(draft.related ?? []).filter((t) => t.id !== draft.ticket?.id).length > 0 && (
        <p className={styles.related}>
          Relacionado: {draft.related.filter((t) => t.id !== draft.ticket?.id).map((t) => `${t.id} · ${t.title}`).join(", ")}
        </p>
      )}
      {options.length > 0 && (
        <div className={styles.actions}>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={optionStyle(o.id)}
              disabled={!interactive}
              onClick={() => onOption(o)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function TicketSelector({ tickets, interactive, onPickTicket }: { tickets: TicketView[] } & PayloadHandlers) {
  if (tickets.length === 0) return null;
  return (
    <div className={styles.card} role="list" aria-label="Seus chamados">
      {tickets.map((t) => (
        <button
          key={t.id}
          type="button"
          role="listitem"
          className={styles.ticketRow}
          disabled={!interactive}
          onClick={() => onPickTicket(t)}
        >
          <span className={styles.radio} aria-hidden />
          <span className={styles.ticketId}>{t.id}</span>
          <span className={styles.ticketTitle}>{t.title}</span>
          <span className={styles.ticketStatus}>
            <Dot color={statusDot(t.status)} />
            {t.statusLabel}
          </span>
          <span className={styles.ticketDate}>{formatDay(t.createdAt)}</span>
        </button>
      ))}
    </div>
  );
}

function TicketCard({ ticket, updates }: { ticket: TicketView; updates: TicketUpdate[] }) {
  const lastUpdate = updates.at(-1)?.createdAt ?? ticket.updatedAt;
  return (
    <article className={styles.card} aria-label={`Chamado ${ticket.id}`}>
      <div className={styles.body}>
        <Eyebrow
          kind="Chamado"
          id={ticket.id}
          dot={statusDot(ticket.status)}
          label={ticket.statusLabel}
          labelColor={ticket.status === "aguardando_analista" ? "var(--warning-text)" : "var(--ink-2)"}
        />
        <h3 className={styles.title}>{ticket.title}</h3>
        <p className={styles.description}>{ticket.description}</p>
      </div>
      <div className={styles.fields}>
        <Field label="Categoria">{ticket.category}</Field>
        <Field label="Prioridade">
          <Dot color={PRIORITY_DOT[ticket.priority]} />
          {ticket.priorityLabel}
        </Field>
        <Field label="Aberto em">{formatDateTime(ticket.createdAt)}</Field>
        <Field label="Última atualização">
          <span style={ticket.overdue ? { color: "var(--warning-text)" } : undefined}>{formatRelative(lastUpdate)}</span>
          {ticket.overdue && <span className={styles.muted}>· prazo vencido</span>}
        </Field>
      </div>
    </article>
  );
}

function ArticleList({ articles }: { articles: Article[] }) {
  if (articles.length === 0) return null;
  return (
    <div className={styles.card} aria-label="Artigos da central de ajuda">
      {articles.map((a) => (
        <details key={a.id} className={styles.article}>
          <summary>
            <span className={styles.ticketId}>{a.source === "resolution" ? "Caso resolvido" : "Central de ajuda"}</span>
            <span className={styles.ticketTitle}>{a.title}</span>
          </summary>
          <p>{a.body}</p>
        </details>
      ))}
    </div>
  );
}
