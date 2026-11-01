"use client";
import { useEffect, useState } from "react";

interface Msg { id: number; role: "user" | "agent" | "analyst"; content: string }

// UI mínima provisória: ajustar ao protótipo do Anexo C quando disponível.
export default function Page() {
  const [convId, setConvId] = useState<string>();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("nexo:conv");
    if (saved) setConvId(saved);
  }, []);
  useEffect(() => {
    if (!convId) return;
    const load = () =>
      fetch(`/api/conversations/${convId}`).then((r) => r.json()).then((d) => d.messages && setMessages(d.messages));
    load();
    const t = setInterval(load, 3000); // recebe respostas do analista
    return () => clearInterval(t);
  }, [convId]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    const message = text;
    setText("");
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: convId, message }),
    }).then((r) => r.json());
    if (res.conversation) {
      localStorage.setItem("nexo:conv", res.conversation.id);
      setConvId(res.conversation.id);
    }
    setBusy(false);
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 16 }}>
      <h1>Nexo Assist</h1>
      {messages.map((m) => (
        <p key={m.id}><b>{m.role}:</b> {m.content}</p>
      ))}
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
        disabled={busy} placeholder="Digite sua mensagem" style={{ width: "100%", padding: 8 }} />
    </main>
  );
}
