"use client";
/**
 * Polling que só roda com a aba visível: em segundo plano o intervalo não dispara, e ao voltar
 * a aba faz uma chamada na hora. Com 2.000 funcionários, abas abertas e esquecidas seriam a maior
 * parte do tráfego de polling.
 * @wiki docs/brain/conventions/FrontendUI.md
 */
import { useEffect, useRef } from "react";

export function usePolling(fn: () => void | Promise<void>, intervalMs: number, enabled = true): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      void fnRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    const t = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
