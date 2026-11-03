"use client";
/**
 * Console do analista (Anexo C, telas 4 e 5): lista de conversas, conversa com o raciocínio do agent,
 * assumir / responder / devolver / encerrar e painel com os chamados do funcionário.
 * Atualização por polling (lista e conversa aberta), pausado com a aba oculta.
 * @wiki docs/brain/conventions/FrontendUI.md
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LogOut, MessagesSquare } from "lucide-react";
import { analystApi, ApiError, type AnalystConversation, type AnalystConversationDetail, type TicketView } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { NexoMark } from "@/components/NexoMark";
import { initialsOf, useSession } from "@/components/session/SessionProvider";
import { ConversationList } from "./ConversationList";
import { ConversationPane, type PaneAction } from "./ConversationPane";
import { TicketPanel } from "./TicketPanel";
import { ResolveTicketDialog } from "./ResolveTicketDialog";
import { assistantBrief, type Filter } from "./labels";
import styles from "./Console.module.css";

const POLL_LIST_MS = 4000;
const POLL_DETAIL_MS = 3000;

const ERRORS: Record<string, string> = {
  ALREADY_TAKEN: "Outro analista já assumiu esta conversa.",
  NOT_ASSIGNED: "Você não está atendendo esta conversa. Assuma o atendimento primeiro.",
  CONVERSATION_CLOSED: "Esta conversa já foi encerrada.",
  NOT_FOUND: "Conversa não encontrada.",
};
const message = (e: unknown, fallback: string) => (e instanceof ApiError ? (ERRORS[e.code] ?? e.message) : fallback);

export function AnalystConsole() {
  const { user, logout } = useSession();
  const [items, setItems] = useState<AnalystConversation[]>();
  const [listError, setListError] = useState<string>();
  const [filter, setFilter] = useState<Filter>("forYou");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<AnalystConversationDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [paneError, setPaneError] = useState<string>();
  const [busy, setBusy] = useState<PaneAction | "reply">();
  // Em telas estreitas o painel de chamados sobrepõe a conversa: começa fechado (abre pelo ícone do cabeçalho).
  const [ticketsOpen, setTicketsOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 1281px)").matches);
  // Diálogos do produto no lugar de confirm()/prompt(): encerrar atendimento e resolver chamado.
  const [confirmClose, setConfirmClose] = useState(false);
  const [resolving, setResolving] = useState<TicketView | null>(null);

  // ---- Lista: busca no servidor (debounce) + polling ----
  const queryRef = useRef(query);
  queryRef.current = query;
  const refreshList = useCallback(async () => {
    try {
      const q = queryRef.current.trim();
      const list = await analystApi.list(q || undefined);
      if (q === queryRef.current.trim()) setItems(list);
      setListError(undefined);
    } catch {
      setListError("Não foi possível carregar as conversas. Tentando de novo…");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refreshList(), query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query, refreshList]);

  usePolling(refreshList, POLL_LIST_MS);

  // ---- Conversa aberta ----
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const refreshDetail = useCallback(async (id: string) => {
    try {
      const d = await analystApi.get(id);
      if (selectedRef.current === id) {
        setDetail(d);
        setPaneError(undefined);
      }
    } catch (e) {
      if (selectedRef.current === id) setPaneError(message(e, "Não foi possível carregar a conversa."));
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setDetail(undefined);
    setPaneError(undefined);
    setDetailLoading(true);
    void refreshDetail(selectedId).finally(() => setDetailLoading(false));
  }, [selectedId, refreshDetail]);
  usePolling(() => (selectedId ? refreshDetail(selectedId) : undefined), POLL_DETAIL_MS, !!selectedId);

  async function act(action: PaneAction) {
    if (!selectedId || busy) return;
    if (action === "close" && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    setConfirmClose(false);
    setBusy(action);
    setPaneError(undefined);
    try {
      if (action === "take") await analystApi.take(selectedId);
      else if (action === "giveBack") await analystApi.giveBack(selectedId);
      else await analystApi.close(selectedId);
      if (action === "take") setFilter("mine");
    } catch (e) {
      setPaneError(message(e, "Não foi possível concluir a ação. Tente de novo."));
    } finally {
      await Promise.all([refreshDetail(selectedId), refreshList()]);
      setBusy(undefined);
    }
  }

  /** "Ver chamado": abrir o painel já é começar a atender; ao fechá-lo o analista volta para a conversa pronto para responder. */
  async function viewTicket() {
    if (!detail || busy) return;
    const s = detail.conversation.state;
    if (s === "waiting_analyst" || s === "agent") await act("take");
    setTicketsOpen(true);
  }

  /** Chamado resolvido pelo diálogo: o painel e a lista recarregam para refletir o novo estado. */
  async function resolved() {
    setResolving(null);
    if (selectedId) await Promise.all([refreshDetail(selectedId), refreshList()]);
  }

  async function reply(text: string): Promise<boolean> {
    if (!selectedId) return false;
    setBusy("reply");
    setPaneError(undefined);
    try {
      await analystApi.reply(selectedId, text);
      await refreshDetail(selectedId);
      void refreshList();
      return true;
    } catch (e) {
      setPaneError(message(e, "Não foi possível enviar. Tente de novo."));
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  const waiting = items?.filter((c) => c.state === "waiting_analyst").length ?? 0;
  const employeeName = detail?.conversation.employee?.name ?? "Funcionário";

  return (
    <div className={styles.shell} data-view={selectedId ? "conversation" : "list"}>
      <nav className={styles.rail} aria-label="Navegação do console">
        <div className={styles.railLogo}>
          <NexoMark size={22} />
        </div>
        <span className={styles.railItem} aria-label={`Conversas, ${waiting} aguardando atendente`} title="Conversas">
          <MessagesSquare size={19} aria-hidden />
          {waiting > 0 && <span className={styles.railBadge}>{waiting}</span>}
        </span>
        <span className={styles.railSpacer} />
        <span className={styles.me} title={`${user.name} · ${user.department}`}>
          {initialsOf(user.name)}
          <span className={styles.online} aria-hidden />
        </span>
        <button type="button" className={styles.logout} onClick={() => void logout()} aria-label="Sair" title="Sair">
          <LogOut size={16} aria-hidden />
        </button>
      </nav>

      <ConversationList
        me={user}
        items={items}
        error={listError}
        filter={filter}
        onFilter={setFilter}
        query={query}
        onQuery={setQuery}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <ConversationPane
        me={user}
        detail={detail}
        loading={detailLoading}
        error={paneError}
        busy={busy}
        ticketsOpen={ticketsOpen}
        onToggleTickets={() => setTicketsOpen(true)}
        onViewTicket={() => void viewTicket()}
        onBack={() => setSelectedId(undefined)}
        onAction={(a) => void act(a)}
        onReply={reply}
      />

      {detail && ticketsOpen && (
        <TicketPanel
          employeeName={employeeName}
          tickets={detail.tickets}
          currentId={detail.conversation.ticketId}
          brief={assistantBrief(detail)}
          onClose={() => setTicketsOpen(false)}
          onResolve={setResolving}
        />
      )}

      <ConfirmDialog
        open={confirmClose}
        tone="danger"
        title="Encerrar o atendimento?"
        description="O funcionário não poderá mais enviar mensagens nesta conversa."
        confirmLabel="Encerrar atendimento"
        busy={busy === "close"}
        onConfirm={() => void act("close")}
        onClose={() => setConfirmClose(false)}
      />
      <ResolveTicketDialog ticket={resolving} onResolved={() => void resolved()} onClose={() => setResolving(null)} />
    </div>
  );
}
