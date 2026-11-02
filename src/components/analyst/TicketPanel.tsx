"use client";
import { useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { TicketView } from "@/lib/api";
import { formatDateTime, formatDay } from "@/lib/format";
import { statusDot } from "@/components/chat/payload/tones";
import { firstName } from "./labels";
import styles from "./Console.module.css";

const OPEN = new Set(["aberto", "em_atendimento", "aguardando_analista", "aprovado"]);

function deadline(t: TicketView): React.ReactNode {
  if (!OPEN.has(t.status)) return t.resolvedAt ? `Resolvido em ${formatDay(t.resolvedAt)}` : t.statusLabel;
  if (t.overdue) return <span className={styles.overdue}>Vencido desde {formatDateTime(t.dueAt)}</span>;
  return `Prazo: ${t.slaLabel}, até ${formatDateTime(t.dueAt)}`;
}

/**
 * Painel "Chamados do funcionário": o da conversa em destaque e os demais, expansíveis.
 * `tickets === null`: sistema de chamados indisponível; só o painel degrada, a conversa segue visível.
 */
export function TicketPanel({
  employeeName,
  tickets,
  currentId,
  onClose,
}: {
  employeeName: string;
  tickets: TicketView[] | null;
  currentId: string | null;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string>();
  const list = tickets ?? [];
  const current = list.find((t) => t.id === currentId);
  const others = list.filter((t) => t.id !== currentId);
  const open = list.filter((t) => OPEN.has(t.status)).length;
  const first = firstName(employeeName);

  return (
    <aside className={styles.tickets} aria-label={`Chamados de ${first}`}>
      <header className={styles.ticketsHeader}>
        <div className={styles.who}>
          <strong>Chamados de {first}</strong>
          <span>
            {tickets === null
              ? "indisponível no momento"
              : `${open} ${open === 1 ? "aberto" : "abertos"} · ${list.length - open} ${list.length - open === 1 ? "encerrado" : "encerrados"}`}
          </span>
        </div>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar painel de chamados">
          <X size={18} aria-hidden />
        </button>
      </header>
      {tickets === null ? (
        <div className={styles.ticketsBody}>
          <p className={styles.ticketMeta} role="status">
            Sistema de chamados temporariamente indisponível. Os chamados de {first} aparecem aqui assim que ele voltar.
          </p>
        </div>
      ) : (
      <div className={styles.ticketsBody}>
        {current && (
          <section>
            <h2 className={styles.sectionLabel}>Desta conversa</h2>
            <div className={styles.current}>
              <div className={styles.currentRow}>
                <span>{current.id}</span>
                <span className={styles.status}>
                  <i style={{ background: statusDot(current.status) }} aria-hidden />
                  {current.statusLabel}
                </span>
              </div>
              <h3>{current.title}</h3>
              <p>
                {current.type === "INC" ? "Incidente" : "Requisição"} · {current.category} · prioridade {current.priorityLabel.toLowerCase()}
              </p>
              <p>{deadline(current)}</p>
              <div className={styles.currentFoot}>{current.description}</div>
            </div>
          </section>
        )}
        <section>
          <h2 className={styles.sectionLabel}>{current ? "Outros chamados" : "Chamados"}</h2>
          {others.length === 0 ? (
            <p className={styles.ticketMeta}>{current ? "Nenhum outro chamado." : `${first} não tem chamados.`}</p>
          ) : (
            <ul className={styles.ticketList}>
              {others.map((t) => {
                const isOpen = expanded === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={styles.ticketBtn}
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? undefined : t.id)}
                    >
                      <i style={{ background: statusDot(t.status) }} aria-hidden />
                      <div>
                        <strong>{t.title}</strong>
                        <span className={styles.ticketMeta}>
                          {t.id} · {t.statusLabel}
                          {t.overdue && <span className={styles.overdue}> · vencido</span>}
                        </span>
                      </div>
                      <ChevronRight size={16} aria-hidden />
                    </button>
                    {isOpen && (
                      <div className={styles.ticketMore}>
                        {t.category} · prioridade {t.priorityLabel.toLowerCase()} · afetados: {t.affected}
                        {"\n"}
                        {deadline(t)}
                        {"\n\n"}
                        {t.description}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      )}
    </aside>
  );
}
