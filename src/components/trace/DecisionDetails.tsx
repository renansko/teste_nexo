"use client";
/**
 * Detalhe de uma resposta do assistente: o que entendeu, que ação tomou, com que segurança e por quê,
 * mais os passos executados. Usado no chat do funcionário e no console do analista.
 * @wiki docs/brain/entities/DecisionTrace.md
 */
import { Check, LoaderCircle, X } from "lucide-react";
import type { Confidence, Trace } from "@/lib/api";
import styles from "./Trace.module.css";

const CONFIDENCE: Record<Confidence, { label: string; tone: string }> = {
  alta: { label: "Alta", tone: "success" },
  media: { label: "Média", tone: "warning" },
  baixa: { label: "Baixa", tone: "danger" },
};

const SOURCE: Record<Trace["source"], string> = {
  agent: "Decidido pelo assistente (IA)",
  flow: "Formulário guiado, sem IA",
  action: "Ação executada após confirmação, sem IA",
  rule: "Regra do service desk, sem IA",
};

/** Há algo além dos rótulos para mostrar? */
export function hasDetails(trace: Trace | null | undefined): trace is Trace {
  return !!trace && (!!trace.decision || trace.actions.length > 0 || !!trace.notes?.length);
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const c = CONFIDENCE[confidence];
  return (
    <span className={styles.badge} data-tone={c.tone}>
      Segurança {c.label.toLowerCase()}
    </span>
  );
}

/**
 * `technical` mostra também notas internas, modelo, tokens e tempo (console do analista).
 */
export function DecisionDetails({ trace, technical = false, id }: { trace: Trace; technical?: boolean; id?: string }) {
  const d = trace.decision;
  const notes = trace.notes ?? [];
  return (
    <div className={styles.panel} id={id}>
      <div className={styles.head}>
        <span className={styles.source}>{SOURCE[trace.source]}</span>
        {d && <ConfidenceBadge confidence={d.confidence} />}
      </div>
      {d && (
        <dl className={styles.fields}>
          <dt>O que entendeu</dt>
          <dd>{d.understanding}</dd>
          <dt>O que fez</dt>
          <dd>{d.action}</dd>
          <dt>Por quê</dt>
          <dd>{d.reasoning}</dd>
        </dl>
      )}
      {trace.actions.length > 0 && (
        <div className={styles.section}>
          <span className={styles.label}>Passos</span>
          <ol className={styles.steps}>
            {trace.actions.map((a) => (
              <li key={a.id} data-status={a.status}>
                {a.status === "pending" ? (
                  <LoaderCircle size={13} aria-hidden />
                ) : a.status === "error" ? (
                  <X size={13} aria-hidden />
                ) : (
                  <Check size={13} aria-hidden />
                )}
                <span>
                  <strong>{a.label}</strong>
                  {a.summary && <span className={styles.summary}> · {a.summary}</span>}
                  {a.status === "error" && <span className={styles.summary}> (falhou)</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {technical && notes.length > 0 && (
        <div className={styles.section}>
          <span className={styles.label}>Observações do engine</span>
          <ul className={styles.notes}>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {technical && (trace.model || trace.usage || trace.durationMs !== undefined) && (
        <p className={styles.meta}>
          {[
            trace.model,
            trace.usage && `${trace.usage.inputTokens + trace.usage.outputTokens} tokens`,
            trace.usage?.cachedInputTokens ? `${trace.usage.cachedInputTokens} em cache` : undefined,
            trace.durationMs !== undefined && `${(trace.durationMs / 1000).toFixed(1)} s`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
