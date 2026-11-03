/**
 * Simula o sistema de chamados legado que "de vez em quando fica indisponível por alguns segundos".
 * Toda chamada pública do TicketService passa por `gateway.call`; quem consome (tools) usa `withRetry`.
 * @wiki docs/brain/conventions/LegacyOutage.md
 */
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

export interface OutageConfig {
  /** Probabilidade (0–1) de uma chamada iniciar uma janela de indisponibilidade. */
  rate: number;
  /** Duração da janela em ms. */
  durationMs: number;
  /** Circuit breaker (lado cliente): por quanto tempo, após uma falha, as chamadas falham na hora sem tentar. */
  breakerMs: number;
  random: () => number;
  now: () => number;
}

/** Cooldown padrão do breaker: a ordem de grandeza da janela do PRD ("alguns segundos"). */
export const BREAKER_MS = 2000;

export const unavailableError = (circuitOpen = false) =>
  new AppError(
    "TICKET_SERVICE_UNAVAILABLE",
    circuitOpen ? "Sistema de chamados indisponível (circuito aberto)" : "Sistema de chamados temporariamente indisponível",
    503,
    circuitOpen ? { circuitOpen: true } : undefined,
  );

/**
 * Dois relógios distintos: `downUntil` é o sistema remoto simulado (não controlamos); `openUntil` é o nosso
 * circuit breaker, que lembra a última falha e evita gastar retries (e segurar conexões) enquanto ele provavelmente
 * segue fora. Os dois usam `config.now` para os testes injetarem o mesmo relógio.
 */
export class LegacyGateway {
  private downUntil = 0;
  private openUntil = 0;
  private config: OutageConfig;

  constructor(config?: Partial<OutageConfig>) {
    this.config = {
      rate: env().NEXO_TICKETS_OUTAGE_RATE,
      durationMs: env().NEXO_TICKETS_OUTAGE_MS,
      breakerMs: BREAKER_MS,
      random: Math.random,
      now: Date.now,
      ...config,
    };
  }

  configure(config: Partial<OutageConfig>): void {
    this.config = { ...this.config, ...config };
    this.downUntil = 0;
    this.openUntil = 0;
  }

  get isDown(): boolean {
    return this.config.now() < this.downUntil;
  }

  /** Breaker aberto: a última chamada falhou há menos de `breakerMs`. */
  get isOpen(): boolean {
    return this.config.now() < this.openUntil;
  }

  tripBreaker(): void {
    this.openUntil = this.config.now() + this.config.breakerMs;
  }

  closeBreaker(): void {
    this.openUntil = 0;
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

/**
 * Repete `fn` apenas quando o erro é `TICKET_SERVICE_UNAVAILABLE`. Devolve também quantas tentativas foram feitas.
 * Circuit breaker: com o breaker aberto (falha recente) a chamada falha na hora, sem tentar nem esperar (`attempts` 0,
 * `details.circuitOpen`). Quem encontra a falha com o breaker fechado abre o breaker e faz os retries normalmente
 * (são as sondas); sucesso em qualquer tentativa fecha o breaker.
 */
export async function withRetry<T>(fn: () => T | Promise<T>, opts: RetryOptions = {}): Promise<{ result: T; attempts: number }> {
  const delays = opts.delaysMs ?? [700, 1400];
  const retries = opts.retries ?? delays.length;
  const sleep = opts.sleep ?? defaultSleep;
  if (legacyGateway.isOpen) throw unavailableError(true);
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const result = await fn();
      legacyGateway.closeBreaker();
      return { result, attempts: attempt };
    } catch (e) {
      const retryable = e instanceof AppError && e.code === "TICKET_SERVICE_UNAVAILABLE";
      if (retryable) legacyGateway.tripBreaker();
      if (!retryable || attempt > retries) throw e;
      opts.onRetry?.(attempt);
      await sleep(delays[attempt - 1] ?? delays[delays.length - 1] ?? 500);
    }
  }
}
