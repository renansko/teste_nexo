/**
 * Renderiza o Markdown leve que o modelo usa nas respostas (negrito, itálico, código inline, listas, parágrafos)
 * como elementos React, sem HTML cru nem dependência. Qualquer outra sintaxe aparece como texto.
 * @wiki docs/brain/conventions/FrontendUI.md
 */
import type { ReactNode } from "react";

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

const LIST_ITEM = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/;
const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.replace(/^#{1,6}\s+/, ""); // "## Título" vira linha comum
    const item = LIST_ITEM.exec(line);
    const last = blocks.at(-1);
    if (item) {
      const kind = item[2] ? "ol" : "ul";
      if (last?.kind === kind) last.items.push(item[3]!);
      else blocks.push({ kind, items: [item[3]!] });
      continue;
    }
    if (!line.trim()) {
      if (last?.kind === "p" && last.lines.length) blocks.push({ kind: "p", lines: [] });
      continue;
    }
    if (last?.kind === "p") last.lines.push(line);
    else blocks.push({ kind: "p", lines: [line] });
  }
  return blocks.filter((b) => (b.kind === "p" ? b.lines.length > 0 : b.items.length > 0));
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const token = m[0];
    if (m.index! > last) out.push(text.slice(last, m.index));
    const key = `${i++}`;
    if (token.startsWith("**") || token.startsWith("__")) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else out.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = m.index! + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function lines(ls: string[]): ReactNode[] {
  return ls.flatMap((l, i) => (i === 0 ? inline(l) : [<br key={`br${i}`} />, ...inline(l)]));
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = toBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{lines(b.lines)}</p>
        ) : b.kind === "ul" ? (
          <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>
        ) : (
          <ol key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>
        ),
      )}
    </div>
  );
}
