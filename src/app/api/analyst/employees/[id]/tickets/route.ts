import { route, type IdParams } from "@/lib/http";
import { requireSession } from "@/engine/auth/token";
import { notFound } from "@/lib/errors";
import { getEmployee } from "@/services/employees/employeeService";
import { employeeTickets } from "@/engine/conversation/analystView";

export const runtime = "nodejs";

/** Painel do analista: chamados de um funcionário (o analista pode ver, o funcionário só os seus). */
export const GET = route(async (req, { params }: IdParams) => {
  requireSession(req, { role: "analyst" });
  const { id } = await params;
  const employee = getEmployee(id);
  if (!employee) throw notFound("Funcionário");
  return Response.json({ employee, tickets: employeeTickets(id) });
});
