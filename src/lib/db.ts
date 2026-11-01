import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

let db: DatabaseSync | undefined;

/** Singleton SQLite (node:sqlite). Cria o schema na primeira abertura. */
export function getDb(): DatabaseSync {
  if (db) return db;
  const path = process.env.NEXO_DB_PATH ?? "./data/nexo.db";
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      customer TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open','in_progress','resolved','closed')),
      priority TEXT NOT NULL CHECK (priority IN ('low','medium','high')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK (state IN ('agent','waiting_analyst','analyst','closed')),
      ticket_id TEXT REFERENCES tickets(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL CHECK (role IN ('user','agent','analyst')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
  `);
  return db;
}

/** Fecha a conexão (usado em testes para simular reinício). */
export function closeDb(): void {
  db?.close();
  db = undefined;
}
