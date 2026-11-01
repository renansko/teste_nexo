/**
 * Conexão SQLite única + migrações versionadas.
 * @wiki docs/brain/conventions/Persistence.md
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      -- O esqueleto anterior (sem versão) tinha tabelas incompatíveis; nunca foi publicado.
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS conversations;
      DROP TABLE IF EXISTS tickets;

      CREATE TABLE employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        department TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('employee','analyst')),
        created_at TEXT NOT NULL
      );

      CREATE TABLE help_articles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        category TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE tickets (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('INC','REQ')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('Acesso','Rede e VPN','Hardware','Software','E-mail','Outros')),
        priority TEXT NOT NULL CHECK (priority IN ('critica','alta','media','baixa')),
        status TEXT NOT NULL CHECK (status IN ('aberto','em_atendimento','aguardando_analista','aprovado','resolvido','fechado')),
        requester_id TEXT NOT NULL REFERENCES employees(id),
        affected TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        due_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX idx_tickets_requester ON tickets(requester_id, status);

      CREATE TABLE ticket_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL REFERENCES tickets(id),
        author_id TEXT NOT NULL,
        author_role TEXT NOT NULL CHECK (author_role IN ('employee','analyst','agent','system')),
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_ticket_updates_ticket ON ticket_updates(ticket_id, id);

      CREATE TABLE ticket_sequences (
        prefix TEXT PRIMARY KEY,
        next INTEGER NOT NULL
      );

      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        assistant_id TEXT NOT NULL,
        employee_id TEXT NOT NULL REFERENCES employees(id),
        analyst_id TEXT REFERENCES employees(id),
        state TEXT NOT NULL CHECK (state IN ('agent','waiting_analyst','analyst','closed')),
        ticket_id TEXT REFERENCES tickets(id),
        user_message_count INTEGER NOT NULL DEFAULT 0,
        active_flow TEXT,
        pending_action TEXT,
        transfer_reason TEXT,
        transfer_summary TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_conversations_employee ON conversations(employee_id, updated_at);
      CREATE INDEX idx_conversations_state ON conversations(state, updated_at);

      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL CHECK (role IN ('user','agent','analyst','system')),
        content TEXT NOT NULL,
        payload TEXT,
        trace TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_messages_conv ON messages(conversation_id, id);
    `,
  },
  {
    version: 2,
    sql: `
      -- Idempotência: a mesma ação confirmada (chave = id do rascunho) nunca grava duas vezes.
      ALTER TABLE tickets ADD COLUMN idempotency_key TEXT;
      CREATE UNIQUE INDEX idx_tickets_idempotency ON tickets(idempotency_key) WHERE idempotency_key IS NOT NULL;
      ALTER TABLE ticket_updates ADD COLUMN idempotency_key TEXT;
      CREATE UNIQUE INDEX idx_ticket_updates_idempotency ON ticket_updates(idempotency_key) WHERE idempotency_key IS NOT NULL;

      -- Fila de ações confirmadas que não puderam ser executadas (sistema de chamados fora do ar).
      CREATE TABLE action_queue (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        input TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued','processing','done','failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_action_queue_due ON action_queue(status, next_attempt_at);
    `,
  },
];

let db: DatabaseSync | undefined;

/** Singleton SQLite (node:sqlite). Aplica as migrações pendentes na primeira abertura. */
export function getDb(): DatabaseSync {
  if (db) return db;
  const path = process.env.NEXO_DB_PATH ?? "./data/nexo.db";
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const conn = new DatabaseSync(path);
  conn.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);
  migrate(conn);
  db = conn;
  return conn;
}

function migrate(conn: DatabaseSync): void {
  conn.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set(
    (conn.prepare(`SELECT version FROM schema_migrations`).all() as unknown as { version: number }[]).map((r) => r.version),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    conn.exec("BEGIN");
    try {
      conn.exec(m.sql);
      conn.prepare(`INSERT INTO schema_migrations VALUES (?, ?)`).run(m.version, new Date().toISOString());
      conn.exec("COMMIT");
    } catch (e) {
      conn.exec("ROLLBACK");
      throw e;
    }
  }
}

/** Fecha a conexão (testes simulam reinício reabrindo do arquivo). */
export function closeDb(): void {
  db?.close();
  db = undefined;
}

/**
 * Executa `fn` numa transação; faz rollback se lançar.
 * IMMEDIATE pega o lock de escrita no início: "ler, decidir e gravar" (ex.: checar duplicidade e inserir)
 * fica serializado mesmo com mais de um processo no mesmo arquivo.
 */
export function transaction<T>(fn: () => T): T {
  const conn = getDb();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}
