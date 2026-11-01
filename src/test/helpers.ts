/** Utilidades de teste: banco temporário por processo e gateway legado sem falhas. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, getDb } from "@/lib/db";
import { resetBoot } from "@/lib/bootstrap";
import { legacyGateway } from "@/services/tickets/legacyGateway";
import { seedNexo } from "@/assistants/nexo/seed";

export function useTempDb(opts: { seed?: boolean; now?: Date } = {}): string {
  closeDb();
  resetBoot();
  const path = join(mkdtempSync(join(tmpdir(), "nexo-test-")), "nexo.db");
  process.env.NEXO_DB_PATH = path;
  legacyGateway.configure({ rate: 0 });
  getDb();
  if (opts.seed) seedNexo(opts.now);
  return path;
}

/** Segunda-feira 2026-03-02 10:00 em Brasília (13:00Z): dia útil, dentro do expediente. */
export const MONDAY_10H = new Date("2026-03-02T13:00:00.000Z");
