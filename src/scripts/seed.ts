import { getDb } from "@/lib/db";
import { seedNexo } from "@/assistants/nexo/seed";

getDb();
const r = seedNexo();
console.log(`Seed aplicado em ${process.env.NEXO_DB_PATH ?? "./data/nexo.db"}: ${r.employees} funcionários, ${r.articles} artigos, ${r.tickets} chamados novos.`);
