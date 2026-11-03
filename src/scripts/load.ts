/**
 * Teste de carga: N funcionários (padrão 2.000, o tamanho da Nexo no PRD) usando a API exatamente como o front usa,
 * sem custo de modelo. Pré-requisito: servidor rodando com `NEXO_MODEL=stub/nexo` (runner determinístico) e, para
 * o seed dos funcionários de carga, apontando para o mesmo `NEXO_DB_PATH` deste script.
 *
 *   NEXO_DB_PATH=./data/load.db npm run load -- --base http://localhost:3100 --employees 2000 --concurrency 100
 *
 * Cada funcionário virtual: login → lista conversas → cria conversa → M mensagens por SSE (uma delas barrada por regra),
 * cada uma seguida do polling incremental e de um polling ocioso com If-None-Match (304) → lista os próprios chamados. Confere privacidade (só vê o que é dele)
 * e imprime latências por endpoint (p50/p95/p99), erros e vazão. Sai com código 1 se houver violação de privacidade.
 * @wiki docs/brain/conventions/LoadTesting.md
 */
import { transaction } from "@/lib/db";
import { upsertEmployee } from "@/services/employees/employeeService";

interface Options { base: string; employees: number; concurrency: number; messages: number; seed: boolean; thinkMs: number }

function parseArgs(argv: string[]): Options {
  const o: Options = { base: "http://localhost:3100", employees: 2000, concurrency: 100, messages: 4, seed: true, thinkMs: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const [k, inline] = argv[i]!.split("=", 2);
    const v = inline ?? argv[i + 1];
    const num = () => { if (inline === undefined) i += 1; return Number(v); };
    if (k === "--base") { o.base = String(v).replace(/\/$/, ""); if (inline === undefined) i += 1; }
    else if (k === "--employees") o.employees = num();
    else if (k === "--concurrency") o.concurrency = num();
    else if (k === "--messages") o.messages = num();
    else if (k === "--think") o.thinkMs = num();
    else if (k === "--no-seed") o.seed = false;
    else throw new Error(`argumento desconhecido: ${k}`);
  }
  return o;
}

/** Funcionários de carga: ids/e-mails previsíveis, fora do Anexo B, para o login e a checagem de privacidade. */
const loadEmail = (n: number) => `carga-${String(n).padStart(4, "0")}@nexo.com`;
const loadId = (n: number) => `load-${String(n).padStart(4, "0")}`;

function seedEmployees(n: number): void {
  transaction(() => {
    for (let i = 1; i <= n; i += 1) {
      upsertEmployee({ id: loadId(i), name: `Funcionário de carga ${i}`, email: loadEmail(i), department: "Carga", role: "employee" });
    }
  });
}

// Roteiro de um funcionário virtual: chamados (tool + legado), central (busca + artigo), mensagem barrada por regra, texto livre.
const SCRIPT = ["como estão meus chamados abertos?", "minha vpn dá erro 809 no windows", "???", "obrigado, era só isso"];

// ---- métricas -------------------------------------------------------------------------------------------------

const samples = new Map<string, number[]>();
const errors = new Map<string, number>();
const counters = { turns: 0, ruleReplies: 0, sseErrors: 0, privacyViolations: 0, httpErrors: 0, legacyUnavailable: 0, idle304: 0 };

function record(name: string, ms: number, ok: boolean): void {
  (samples.get(name) ?? samples.set(name, []).get(name)!).push(ms);
  if (!ok) errors.set(name, (errors.get(name) ?? 0) + 1);
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] ?? 0;

// ---- cliente HTTP (o mesmo contrato de src/lib/api.ts) ---------------------------------------------------------

async function call(
  base: string, name: string, path: string, init: RequestInit & { token?: string; etag?: string } = {},
): Promise<{ status: number; json: any; etag?: string }> {
  const t0 = performance.now();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    ...(init.etag ? { "if-none-match": init.etag } : {}),
  };
  try {
    const res = await fetch(`${base}${path}`, { ...init, headers });
    const json = res.status === 304 ? undefined : await res.json().catch(() => undefined);
    const ok = res.status < 400;
    record(name, performance.now() - t0, ok);
    if (!ok) counters.httpErrors += 1;
    return { status: res.status, json, etag: res.headers.get("etag") ?? undefined };
  } catch (e) {
    record(name, performance.now() - t0, false);
    counters.httpErrors += 1;
    return { status: 0, json: { error: "NETWORK", message: String(e) } };
  }
}

/** Envia a mensagem por SSE e consome o stream inteiro, como `streamMessage` no front. */
async function sendMessage(base: string, token: string, convId: string, text: string): Promise<{ lastId?: string; events: string[] }> {
  const t0 = performance.now();
  const events: string[] = [];
  let lastId: string | undefined;
  let first = false;
  try {
    const res = await fetch(`${base}/api/conversations/${encodeURIComponent(convId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
    });
    if (res.status >= 400 || !res.body) {
      record("message.turn (SSE)", performance.now() - t0, false);
      counters.httpErrors += 1;
      return { events };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf("\n\n");
      while (sep >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf("\n\n");
        const type = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (!type) continue;
        if (!first) { first = true; record("message.first-event", performance.now() - t0, true); }
        events.push(type);
        const parsed = data ? (JSON.parse(data) as any) : {};
        if (type === "trace" && parsed.trace?.source === "rule") counters.ruleReplies += 1;
        // Tool falhou após os retries do legado: o turno responde mesmo assim (nota no trace), sem evento error.
        if (type === "trace" && JSON.stringify(parsed.trace?.notes ?? []).includes("TICKET_SERVICE_UNAVAILABLE")) counters.legacyUnavailable += 1;
        if (type === "message.end") lastId = String(parsed.message?.id ?? lastId);
        if (type === "error") counters.sseErrors += 1;
      }
    }
    const ok = events.includes("message.end") && !events.includes("error");
    record("message.turn (SSE)", performance.now() - t0, ok);
    counters.turns += 1;
    return { lastId, events };
  } catch (e) {
    record("message.turn (SSE)", performance.now() - t0, false);
    counters.sseErrors += 1;
    return { events };
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---- um funcionário virtual ------------------------------------------------------------------------------------

async function virtualEmployee(o: Options, n: number): Promise<void> {
  const me = loadId(n);
  const login = await call(o.base, "auth.login", "/api/auth/login", { method: "POST", body: JSON.stringify({ email: loadEmail(n), password: "x" }) });
  const token = login.json?.token as string | undefined;
  if (!token) return;

  const list = await call(o.base, "conversations.list", "/api/conversations", { token });
  if (Array.isArray(list.json) && list.json.some((c: any) => c.employeeId !== me)) counters.privacyViolations += 1;

  const created = await call(o.base, "conversations.create", "/api/conversations", { method: "POST", body: "{}", token });
  const convId = created.json?.id as string | undefined;
  if (!convId) return;

  let lastId = "0";
  for (let i = 0; i < o.messages; i += 1) {
    const r = await sendMessage(o.base, token, convId, SCRIPT[i % SCRIPT.length]!);
    if (r.lastId) lastId = r.lastId;
    const pollPath = `/api/conversations/${encodeURIComponent(convId)}/messages?after=${encodeURIComponent(lastId)}`;
    const poll = await call(o.base, "messages.poll", pollPath, { token });
    if (poll.json?.conversation && poll.json.conversation.employeeId !== me) counters.privacyViolations += 1;
    // Polling ocioso (o caso comum da aba aberta): nada mudou desde o último ciclo → 304 sem corpo.
    const idle = await call(o.base, "messages.poll (ocioso, If-None-Match)", pollPath, { token, etag: poll.etag });
    if (idle.status === 304) counters.idle304 += 1;
    else if (idle.json?.conversation && idle.json.conversation.employeeId !== me) counters.privacyViolations += 1;
    if (o.thinkMs) await sleep(o.thinkMs);
  }

  const tickets = await call(o.base, "tickets.list", "/api/tickets", { token });
  if (Array.isArray(tickets.json) && tickets.json.some((t: any) => t.requesterId !== me)) counters.privacyViolations += 1;
}

async function runPool(o: Options): Promise<void> {
  let next = 1;
  let done = 0;
  const started = performance.now();
  const worker = async () => {
    for (;;) {
      const n = next;
      next += 1;
      if (n > o.employees) return;
      await virtualEmployee(o, n);
      done += 1;
      if (done % 250 === 0) console.log(`  ${done}/${o.employees} funcionários concluídos (${((performance.now() - started) / 1000).toFixed(0)} s)`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(o.concurrency, o.employees) }, worker));
}

// ---- relatório --------------------------------------------------------------------------------------------------

function report(o: Options, totalMs: number): void {
  const rows = [...samples.entries()].map(([name, v]) => {
    const s = [...v].sort((a, b) => a - b);
    return { endpoint: name, n: s.length, erros: errors.get(name) ?? 0, p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99), max: s.at(-1) ?? 0 };
  });
  const requests = rows.reduce((acc, r) => acc + (r.endpoint === "message.first-event" ? 0 : r.n), 0);
  console.log("\n| endpoint | n | erros | p50 ms | p95 ms | p99 ms | max ms |");
  console.log("|---|---:|---:|---:|---:|---:|---:|");
  for (const r of rows) console.log(`| ${r.endpoint} | ${r.n} | ${r.erros} | ${r.p50.toFixed(0)} | ${r.p95.toFixed(0)} | ${r.p99.toFixed(0)} | ${r.max.toFixed(0)} |`);
  console.log("");
  console.log(`funcionários: ${o.employees} · concorrência: ${o.concurrency} · mensagens por funcionário: ${o.messages}`);
  console.log(`duração: ${(totalMs / 1000).toFixed(1)} s · requisições: ${requests} (${(requests / (totalMs / 1000)).toFixed(0)} req/s) · turnos: ${counters.turns} (${(counters.turns / (totalMs / 1000)).toFixed(1)} turnos/s)`);
  console.log(`respondidas por regra (sem modelo): ${counters.ruleReplies} · legado indisponível no turno: ${counters.legacyUnavailable} · eventos error no SSE: ${counters.sseErrors} · HTTP ≥ 400 ou rede: ${counters.httpErrors}`);
  console.log(`polling ocioso respondido com 304: ${counters.idle304} · violações de privacidade: ${counters.privacyViolations}`);
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  const health = await fetch(`${o.base}/api/auth/me`).catch(() => undefined);
  if (!health) throw new Error(`servidor não responde em ${o.base}; suba com NEXO_MODEL=stub/nexo (ver README, "Carga")`);
  if (o.seed) {
    seedEmployees(o.employees);
    console.log(`${o.employees} funcionários de carga garantidos em ${process.env.NEXO_DB_PATH ?? "./data/nexo.db"}`);
  }
  console.log(`carga contra ${o.base}: ${o.employees} funcionários, ${o.concurrency} em paralelo, ${o.messages} mensagens cada`);
  const t0 = performance.now();
  await runPool(o);
  report(o, performance.now() - t0);
  if (counters.privacyViolations > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
