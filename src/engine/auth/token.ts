/**
 * Sessão assinada com HMAC-SHA256 (sem dependências). Aceita em cookie httpOnly e em `Authorization: Bearer`.
 * @wiki docs/brain/conventions/AuthSession.md
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { getEmployee, type Employee, type EmployeeRole } from "@/services/employees/employeeService";

export const SESSION_COOKIE = "nexo_session";
const DEFAULT_TTL_S = 7 * 24 * 3600;
const DEV_SECRET = "dev-secret-change-me";
let warned = false;

export interface SessionClaims { sub: string; role: EmployeeRole; exp: number }
export interface Session { user: Employee; claims: SessionClaims }

function secret(): string {
  const { NEXO_AUTH_SECRET: s, NODE_ENV } = env();
  if (s) return s;
  // Em produção o segredo de desenvolvimento é público (está no código): aceitar permitiria forjar sessões de analista.
  // O boot já barra isso (assertRuntimeEnv); aqui é defesa em profundidade para entrypoints que não passem por ele.
  if (NODE_ENV === "production") {
    throw new AppError("AUTH_NOT_CONFIGURED", "Autenticação indisponível: servidor sem NEXO_AUTH_SECRET configurado", 500);
  }
  if (!warned && NODE_ENV !== "test") {
    warned = true;
    console.warn("[auth] NEXO_AUTH_SECRET não definido; usando segredo de desenvolvimento.");
  }
  return DEV_SECRET;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const mac = (payload: string) => createHmac("sha256", secret()).update(payload).digest();

export function signSession(claims: Omit<SessionClaims, "exp"> & { exp?: number }, now = new Date()): string {
  const exp = claims.exp ?? Math.floor(now.getTime() / 1000) + DEFAULT_TTL_S;
  const payload = b64(JSON.stringify({ sub: claims.sub, role: claims.role, exp }));
  return `${payload}.${b64(mac(payload))}`;
}

export function verifySession(token: string, now = new Date()): SessionClaims | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = mac(payload);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionClaims;
    if (typeof claims.sub !== "string" || typeof claims.exp !== "number") return null;
    if (claims.exp * 1000 < now.getTime()) return null;
    return claims;
  } catch {
    return null;
  }
}

function tokenFrom(req: Request): string | undefined {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m?.[1] ? decodeURIComponent(m[1]) : undefined;
}

export function resolveSession(req: Request): Session | null {
  const token = tokenFrom(req);
  if (!token) return null;
  const claims = verifySession(token);
  if (!claims) return null;
  const user = getEmployee(claims.sub);
  return user ? { user, claims } : null;
}

export function requireSession(req: Request, opts: { role?: EmployeeRole } = {}): Session {
  const s = resolveSession(req);
  if (!s) throw new AppError("UNAUTHENTICATED", "Faça login para continuar", 401);
  if (opts.role && s.user.role !== opts.role) throw new AppError("FORBIDDEN", "Sem permissão para esta ação", 403);
  return s;
}

/** `Secure` só quando a requisição chegou por HTTPS (direto ou via proxy); em http://localhost o navegador descartaria o cookie. */
export function isSecureRequest(req: Request): boolean {
  return new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

export function sessionCookie(token: string | null, opts: { secure?: boolean; maxAgeS?: number } = {}): string {
  const maxAgeS = opts.maxAgeS ?? DEFAULT_TTL_S;
  const secure = opts.secure ? "; Secure" : "";
  if (token === null) return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${secure}`;
}
