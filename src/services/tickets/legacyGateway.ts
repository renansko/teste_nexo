/**
 * Simula o sistema de chamados legado que "de vez em quando fica indisponível por alguns segundos".
 * Toda chamada pública do TicketService passa por `gateway.call`; quem consome (tools) usa `withRetry`.
 * @wiki docs/brain/conventions/LegacyOutage.md
 */
import { AppError } from "@/lib/errors";

export interface OutageConfig {
  /** Probabilidade (0–1) de uma chamada iniciar uma janela de indisponibilidade. */
  rate: number;
  /** Duração da janela em ms. */
  durationMs: number;
  random: () => number;
  now: () => number;
}

export const unavailableError = () =>
  new AppError("TICKET_SERVICE_UNAVAILABLE", "Sistema de chamados temporariamente indisponível", 503);

export class LegacyGateway {
  private downUntil = 0;
  private config: OutageConfig;

  constructor(config?: Partial<OutageConfig>) {
    this.config = {
      rate: Number(process.env.NEXO_TICKETS_OUTAGE_RATE ?? "0.05"),
      durationMs: Number(process.env.NEXO_TICKETS_OUTAGE_MS ?? "2000"),
      random: Math.random,
      now: Date.now,
      ...config,
    };
  }

  configure(config: Partial<OutageConfig>): void {
    this.config = { ...this.config, ...config };
    this.downUntil = 0;
  }

  get isDown(): boolean {
    return this.config.now() < this.downUntil;
  }

  call<T>(fn: () => T): T {
    const now = this.config.now();
    if (now < this.downUntil) throw unavailableError();
    if (this.config.rate > 0 && this.config.random() < this.config.rate) {
      this.downUntil = now + this.config.durationMs;
      throw unavailableError();
    }
    return fn();
  }
}

export const legacyGateway = new LegacyGateway();

export interface RetryOptions {
  retries?: number;
  delaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Repete `fn` apenas quando o erro é `TICKET_SERVICE_UNAVAILABLE`. Devolve também quantas tentativas foram feitas. */
export async function withRetry<T>(fn: () => T | Promise<T>, opts: RetryOptions = {}): Promise<{ result: T; attempts: number }> {
  const delays = opts.delaysMs ?? [700, 1400];
  const retries = opts.retries ?? delays.length;
  const sleep = opts.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return { result: await fn(), attempts: attempt };
    } catch (e) {
      const retryable = e instanceof AppError && e.code === "TICKET_SERVICE_UNAVAILABLE";
      if (!retryable || attempt > retries) throw e;
      opts.onRetry?.(attempt);
      await sleep(delays[attempt - 1] ?? delays[delays.length - 1] ?? 500);
    }
  }
}
