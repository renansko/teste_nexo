/**
 * Única porta de leitura do ambiente. Duas camadas:
 * - `env()`: formato e defaults (lido sob demanda; seguro no `next build`, que roda sem `.env`).
 * - `assertRuntimeEnv()`: exigências de execução (chave do provedor, segredo em produção), chamada no boot do servidor.
 * Mensagens de erro citam só o nome da variável, nunca o valor.
 * @wiki docs/brain/conventions/Environment.md
 */
import { z } from "zod";

/** Variável vazia (`FOO=`) conta como ausente, para o default valer. */
const opt = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" ? undefined : v), schema);

/** Modelo único do projeto, no formato `provedor/modelo` do model router do Mastra. */
export const DEFAULT_MODEL = "openai/gpt-6-luna";

/** `provedor/modelo`: o prefixo escolhe o provedor (e a chave `<PROVEDOR>_API_KEY`); o resto é o id no provedor. */
const modelId = z.string().regex(/^[a-z0-9-]+\/.+$/, "use o formato provedor/modelo (ex.: openai/gpt-6-luna)");

const schema = z.object({
  NODE_ENV: opt(z.enum(["development", "production", "test"]).default("development")),
  NEXO_MODEL: opt(modelId.default(DEFAULT_MODEL)),
  NEXO_FAST_MODEL: opt(modelId.default(DEFAULT_MODEL)),
  NEXO_AUTH_SECRET: opt(z.string().min(16, "mínimo de 16 caracteres").optional()),
  NEXO_DB_PATH: opt(z.string().default("./data/nexo.db")),
  NEXO_MESSAGE_LIMIT: opt(z.coerce.number().int().positive().default(30)),
  NEXO_TICKETS_OUTAGE_RATE: opt(z.coerce.number().min(0).max(1).default(0.05)),
  NEXO_TICKETS_OUTAGE_MS: opt(z.coerce.number().int().min(0).default(2000)),
  NEXO_BUSINESS_TZ_OFFSET_MINUTES: opt(z.coerce.number().int().min(-720).max(840).default(-180)),
});

export type Env = z.output<typeof schema>;

export class EnvError extends Error {
  constructor(problems: string[]) {
    super(`Configuração de ambiente inválida:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "EnvError";
  }
}

const describe = (issues: z.core.$ZodIssue[]) => issues.map((i) => `${i.path.join(".") || "(env)"}: ${i.message}`);

/** Lê e valida `process.env` a cada chamada (barato; testes alteram variáveis entre casos). */
export function env(source: Record<string, string | undefined> = process.env): Env {
  const r = schema.safeParse(source);
  if (!r.success) throw new EnvError(describe(r.error.issues));
  return r.data;
}

/** Nome da variável com a chave do provedor de um modelo `provedor/modelo` (convenção do Mastra: `OPENAI_API_KEY`, ...). */
export const apiKeyVarFor = (model: string): string => `${model.split("/")[0]!.toUpperCase().replace(/-/g, "_")}_API_KEY`;

/** Exigências para atender requisições. Falha o boot com a lista completa de problemas. */
export function assertRuntimeEnv(source: Record<string, string | undefined> = process.env): Env {
  const e = env(source);
  const problems: string[] = [];
  if (e.NODE_ENV !== "test") {
    for (const keyVar of new Set([apiKeyVarFor(e.NEXO_MODEL), apiKeyVarFor(e.NEXO_FAST_MODEL)])) {
      if (!source[keyVar]) problems.push(`${keyVar}: obrigatória para o provedor de NEXO_MODEL/NEXO_FAST_MODEL`);
    }
  }
  if (e.NODE_ENV === "production" && !e.NEXO_AUTH_SECRET) problems.push("NEXO_AUTH_SECRET: obrigatório em produção");
  if (problems.length) throw new EnvError(problems);
  return e;
}
