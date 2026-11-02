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
import { checkInput } from "@/engine/conversation/inputGuard";
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
  AGENT_ERROR: "O assistente não conseguiu responder agora. Tente de novo em instantes.",
};

const EMPTY_TURN: { actions: TraceAction[]; text: string } = { actions: [], text: "" };

/** Polling de respostas do analista: mais frequente quando há analista envolvido (também traz o "digitando…"). */
const POLL_ANALYST_MS = 2000;
const POLL_AGENT_MS = 6000;
/** Ritmo do aviso "estou digitando" (menor que o TTL do servidor, 4 s). */
const TYPING_NOTIFY_MS = 1500;

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
  const [analystTyping, setAnalystTyping] = useState(false);
  const typingSentRef = useRef(0);
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
        setAnalystTyping(fresh.conversation.state === "analyst" && fresh.analystTyping);
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
      if (conv.state === "agent") setStreaming(EMPTY_TURN);
      const id = conv.id;
      // Um turno pode gerar várias mensagens (resposta + aviso de sistema, resposta + pergunta do flow),
      // cada uma com seu message.start/message.end.
      await streamMessage(id, input, (e) => {
        switch (e.type) {
          case "message.start":
            setStreaming(EMPTY_TURN);
            break;
          case "action":
            setStreaming((s) => {
              const cur = s ?? EMPTY_TURN;
              return { ...cur, actions: upsert(cur.actions, e.data) };
            });
            break;
          case "text.delta":
            setStreaming((s) => {
              const cur = s ?? EMPTY_TURN;
              return { ...cur, text: cur.text + e.data.delta };
            });
            break;
          case "conversation":
            setConversation((c) => (c ? { ...c, ...e.data } : c));
            break;
          case "message.end":
            setMessages((prev) => [...prev, toMessage(e.data.message)]);
            setStreaming(null);
            break;
          case "error":
            setError(ERRORS[e.data.code] ?? e.data.message ?? ERRORS.AGENT_ERROR);
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
    setAnalystTyping(false);
  }

  /** Só faz sentido com uma pessoa do outro lado: com o agent não há quem veja. */
  function notifyTyping() {
    if (!conversation || conversation.state === "agent" || conversation.state === "closed") return;
    const t = Date.now();
    if (t - typingSentRef.current < TYPING_NOTIFY_MS) return;
    typingSentRef.current = t;
    void api.typing(conversation.id).catch(() => undefined);
  }

  const blocked = conversation?.state === "closed" || (!!conversation && conversation.userMessages >= conversation.limit);
  /** Mesma validação determinística do servidor; sem conversa ainda, valem os defaults do engine. */
  const validate = (text: string) => {
    const r = checkInput(text, conversation?.inputPolicy);
    return r.ok ? undefined : r.message;
  };
  return (
    <>
      <TopBar here="Atendimento" status={STATUS[conversation?.state ?? "agent"]} />
      {loaded && (
        <MessageList
          messages={messages}
          streaming={streaming}
          analystTyping={analystTyping}
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
        disabled={!loaded || sending || blocked}
        placeholder={blocked ? "Comece uma nova conversa para continuar" : undefined}
        onSend={(text) => void send({ text }, text)}
        onTyping={notifyTyping}
        validate={validate}
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
