/**
 * Instância Mastra única do processo. Só existe por um motivo: o storage de runs suspensas (human-in-the-loop).
 * Um Agent sem Mastra usa um store em memória por instância; como o Agent é criado por turno, o snapshot
 * da run se perderia entre duas requisições. O arquivo `mastra.db` fica ao lado de `NEXO_DB_PATH`.
 * @wiki docs/brain/services/HumanInTheLoop.md
 */
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { env } from "@/lib/env";

let instance: Mastra | undefined;
let instancePath: string | undefined;

/** Caminho do banco do Mastra derivado de `NEXO_DB_PATH` (`:memory:` continua em memória). */
export function mastraDbUrl(): string {
  const path = env().NEXO_DB_PATH;
  if (path === ":memory:") return ":memory:";
  return `file:${join(dirname(path), "mastra.db")}`;
}

export function getMastra(): Mastra {
  const url = mastraDbUrl();
  if (instance && instancePath === url) return instance;
  if (url.startsWith("file:")) mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
  instance = new Mastra({ storage: new LibSQLStore({ id: "nexo-runs", url }), logger: false });
  instancePath = url;
  return instance;
}

/** Nomes internos dos workflows do loop do agent, onde o Mastra guarda o snapshot de uma run suspensa. */
const AGENT_LOOP_WORKFLOWS = ["agentic-loop", "agentic-execution"];

/**
 * Apaga o snapshot de uma run que a conversa abandonou (cancelar, analista assumiu/encerrou).
 * Runs concluídas o próprio Mastra apaga; só as suspensas ficariam órfãs. Best-effort: falha vira log.
 */
export function discardSuspendedRun(runId: string): void {
  void (async () => {
    try {
      const store = await getMastra().getStorage()?.getStore("workflows");
      if (!store) return;
      for (const workflowName of AGENT_LOOP_WORKFLOWS) await store.deleteWorkflowRunById({ runId, workflowName });
    } catch (e) {
      console.warn("[mastra] não foi possível apagar a run suspensa:", e instanceof Error ? e.message : e);
    }
  })();
}

/** Testes trocam `NEXO_DB_PATH` entre casos; a próxima chamada recria a instância. */
export function resetMastra(): void {
  instance = undefined;
  instancePath = undefined;
}
