import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { seedNexo } from "@/assistants/nexo/seed";

getDb();
const r = seedNexo();
console.log(`Seed aplicado em ${env().NEXO_DB_PATH}: ${r.employees} funcionários, ${r.articles} artigos, ${r.tickets} chamados novos.`);
