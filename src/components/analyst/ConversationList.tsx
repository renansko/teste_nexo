"use client";
import { Search } from "lucide-react";
import type { AnalystConversation, SessionUser } from "@/lib/api";
import { initialsOf } from "@/components/session/SessionProvider";
import { avatarColors, conversationTag, FILTERS, lastPreview, listTime, matchesFilter, type Filter } from "./labels";
import styles from "./Console.module.css";

interface Props {
  me: SessionUser;
  items: AnalystConversation[] | undefined;
  error?: string;
  filter: Filter;
  onFilter: (f: Filter) => void;
  query: string;
  onQuery: (q: string) => void;
  selectedId?: string;
  onSelect: (id: string) => void;
}

const EMPTY: Record<Filter, string> = {
  all: "Nenhuma conversa ainda.",
  forYou: "Nenhuma conversa aguardando atendente. O agent está dando conta.",
  agent: "Nenhuma conversa com o agent agora.",
  mine: "Você não está atendendo nenhuma conversa.",
};

/** Coluna "Conversas": busca, filtros com contagem e itens com etiqueta de status. */
export function ConversationList({ me, items, error, filter, onFilter, query, onQuery, selectedId, onSelect }: Props) {
  const visible = items?.filter((c) => matchesFilter(c, filter, me)) ?? [];
  return (
    <section className={styles.list} aria-label="Conversas">
      <div className={styles.listHeader}>
        <div className={styles.titleRow}>
          <h1>Conversas</h1>
        </div>
        <label className={styles.search}>
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Pesquisar conversa ou chamado"
            aria-label="Pesquisar conversa ou chamado"
          />
        </label>
        <div className={styles.filters} role="group" aria-label="Filtrar conversas">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={styles.filter} aria-pressed={filter === f.id} onClick={() => onFilter(f.id)}>
              {f.label}
              {f.count && items && <span>{items.filter((c) => matchesFilter(c, f.id, me)).length}</span>}
            </button>
          ))}
        </div>
      </div>

      {!items && !error && <p className={styles.listEmpty}>Carregando conversas…</p>}
      {error && !items && (
        <p className={styles.listEmpty} role="alert">
          {error}
        </p>
      )}
      {items && visible.length === 0 && <p className={styles.listEmpty}>{query ? `Nada encontrado para "${query}".` : EMPTY[filter]}</p>}

      <ul className={styles.items}>
        {visible.map((c) => {
          const name = c.employee?.name ?? "Funcionário removido";
          const tag = conversationTag(c, me);
          const colors = avatarColors(c.employeeId);
          const when = c.lastMessage?.createdAt ?? c.updatedAt;
          return (
            <li key={c.id}>
              <button
                type="button"
                className={styles.item}
                aria-current={c.id === selectedId}
                data-urgent={c.state === "waiting_analyst"}
                onClick={() => onSelect(c.id)}
              >
                <span className={styles.avatar} style={{ ...colors, width: 46, height: 46, fontSize: 15.5 }} aria-hidden>
                  {initialsOf(name)}
                </span>
                <span className={styles.itemText}>
                  <span className={styles.top}>
                    <span className={styles.name}>{name}</span>
                    <time className={styles.time} dateTime={when}>
                      {listTime(when)}
                    </time>
                  </span>
                  <span className={styles.bottom}>
                    <span className={styles.last}>{lastPreview(c, me)}</span>
                  </span>
                  <span className={styles.tag} data-tone={tag.tone}>
                    <i aria-hidden />
                    {tag.label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
