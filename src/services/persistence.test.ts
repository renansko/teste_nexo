import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb } from "@/lib/db";
import * as conv from "@/services/conversations";
import * as tk from "@/services/tickets/ticketService";

test("conversas, chamados e estado sobrevivem a reinício", () => {
  process.env.NEXO_DB_PATH = join(mkdtempSync(join(tmpdir(), "nexo-")), "t.db");
  const c = conv.createConversation();
  const t = tk.createTicket({ customer: "a@b.c", subject: "s", description: "d" });
  conv.linkTicket(c.id, t.id);
  conv.addMessage(c.id, "user", "oi");
  conv.setState(c.id, "waiting_analyst");

  closeDb(); // reinício: reabre do arquivo

  assert.deepEqual(conv.getConversation(c.id), { id: c.id, state: "waiting_analyst", ticketId: t.id });
  assert.equal(conv.listMessages(c.id)[0]?.content, "oi");
  assert.equal(tk.getTicket(t.id)?.status, "open");
});
