/**
 * Inicialização idempotente do processo: abre o banco (migrações) e aplica o seed da persona.
 * Chamado pelas rotas da API; barato depois da primeira vez.
 */
import { getDb } from "./db";
import { seedNexo } from "@/assistants/nexo/seed";

let booted = false;

export function boot(): void {
  if (booted) return;
  getDb();
  seedNexo();
  booted = true;
}

/** Para testes: força novo boot (após trocar NEXO_DB_PATH, por exemplo). */
export function resetBoot(): void {
  booted = false;
}
