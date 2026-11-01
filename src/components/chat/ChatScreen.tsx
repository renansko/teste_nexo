"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/client/TopBar";
import type { Tone } from "@/components/ui/StatusPill";
import {
  api,
  ApiError,
  streamMessage,
  toMessage,
  type ChatMessage,
  type Conversation,
  type Option,
  type SendInput,
  type TicketView,
  type TraceAction,
} from "@/lib/api";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import styles from "./Chat.module.css";

const STATUS: Record<Conversation["state"], { tone: Tone; label: string }> = {
  agent: { tone: "success", label: "Assistente online" },
  waiting_analyst: { tone: "warning", label: "Aguardando analista" },
  analyst: { tone: "primary", label: "Analista na conversa" },
  closed: { tone: "neutral", label: "Conversa encerrada" },
};

const ERRORS: Record<string, string> = {
  MESSAGE_LIMIT: "Esta conversa chegou ao limite de mensagens. Comece uma nova conversa para continuar.",
  CONVERSATION_CLOSED: "Esta conversa foi encerrada. Comece uma nova conversa para continuar.",
};

/** Polling de respostas do analista: mais frequente quando há analista envolvido. */
const POLL_ANALYST_MS = 3000;
const POLL_AGENT_MS = 6000;

/**
 * Chat do funcionário (protótipo: "Chat — Novo chamado" e "Chat — Consulta e transferência").
 * Turnos do agent chegam por SSE; respostas do analista, por polling.
 */
export function ChatScreen() {
  const [conversation, setConversation] = useState<Conversation>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<{ actions: TraceAction[]; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const lastIdRef = useRef<string | undefined>(undefined);
  lastIdRef.current = messages.filter((m) => !m.id.startsWith("tmp-")).at(-1)?.id;

  const load = useCallback(async (id: string) => {
    const data = await api.getConversation(id);
    setConversation(data.conversation);
    setMessages(data.messages);
  }, []);

  // Abre a conversa mais recente ainda aberta; senão começa vazio.
  useEffect(() => {
    api
      .listConversations()
      .then((list) => {
        const open = list.find((c) => c.state !== "closed");
        return open ? load(open.id) : undefined;
      })
      .catch(() => setError("Não foi possível carregar suas conversas."))
      .finally(() => setLoaded(true));
  }, [load]);

  const convId = conversation?.id;
  const state = conversation?.state;
  useEffect(() => {
    if (!convId || !state || state === "closed" || sending) return;
    const t = setInterval(async () => {
      try {
        const fresh = await api.messagesAfter(convId, lastIdRef.current ?? "0");
        setConversation(fresh.conversation);
        if (fresh.messages.length) {
          setMessages((prev) => {
            const known = new Set(prev.map((m) => m.id));
            return [...prev, ...fresh.messages.filter((m) => !known.has(m.id))];
          });
        }
      } catch {
        /* falha transitória de polling: tenta no próximo ciclo */
      }
    }, state === "agent" ? POLL_AGENT_MS : POLL_ANALYST_MS);
    return () => clearInterval(t);
  }, [convId, state, sending]);

  async function send(input: SendInput, display: string) {
    setError(undefined);
    setSending(true);
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: display,
      payload: null,
      trace: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    let conv = conversation;
    try {
      if (!conv || conv.state === "closed") {
        conv = await api.createConversation();
        setConversation(conv);
        setMessages([optimistic]);
      }
      if (conv.state === "agent") setStreaming({ actions: [], text: "" });
      const id = conv.id;
      await streamMessage(id, input, (e) => {
        switch (e.type) {
          case "action":
            setStreaming((s) => s && { ...s, actions: upsert(s.actions, e.data) });
            break;
          case "text.delta":
            setStreaming((s) => s && { ...s, text: s.text + e.data.delta });
            break;
          case "conversation":
            setConversation((c) => (c ? { ...c, ...e.data } : c));
            break;
          case "message.end":
            setMessages((prev) => [...prev, toMessage(e.data.message)]);
            setStreaming(null);
            break;
          case "error":
            setError(ERRORS[e.data.code] ?? e.data.message ?? "O assistente não conseguiu responder. Tente de novo.");
            break;
        }
      });
      await load(id); // ids reais, trace e estado finais
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setError(ERRORS[code] ?? "Não foi possível enviar a mensagem. Tente de novo.");
      if (conv && (code === "CONVERSATION_CLOSED" || code === "MESSAGE_LIMIT")) await load(conv.id).catch(() => undefined);
    } finally {
      setStreaming(null);
      setSending(false);
    }
  }

  function newConversation() {
    setConversation(undefined);
    setMessages([]);
    setError(undefined);
  }

  const blocked = conversation?.state === "closed" || (!!conversation && conversation.userMessages >= conversation.limit);
  return (
    <>
      <TopBar here="Atendimento" status={STATUS[conversation?.state ?? "agent"]} />
      {loaded && (
        <MessageList
          messages={messages}
          streaming={streaming}
          interactive={!sending && conversation?.state === "agent"}
          onOption={(o: Option) => void send({ optionId: o.id, text: o.label }, o.label)}
          onPickTicket={(t: TicketView) => void send({ text: `${t.id} · ${t.title}` }, `${t.id} · ${t.title}`)}
        />
      )}
      {error && (
        <p role="alert" className={styles.banner}>
          {error}
        </p>
      )}
      <Composer
        disabled={sending || blocked}
        placeholder={blocked ? "Comece uma nova conversa para continuar" : undefined}
        onSend={(text) => void send({ text }, text)}
        meta={
          conversation && (
            <>
              <span>
                {conversation.userMessages}/{conversation.limit} mensagens nesta sessão
              </span>
              <button type="button" className={styles.metaAction} onClick={newConversation} disabled={sending}>
                Nova conversa
              </button>
            </>
          )
        }
      />
    </>
  );
}

function upsert(list: TraceAction[], a: TraceAction): TraceAction[] {
  const i = list.findIndex((x) => x.id === a.id);
  if (i === -1) return [...list, a];
  const next = list.slice();
  next[i] = { ...list[i], ...a };
  return next;
}
