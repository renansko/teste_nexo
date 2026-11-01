import { z } from "zod";
import { parseBody, route } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { findEmployeeByEmail } from "@/services/employees/employeeService";
import { isSecureRequest, sessionCookie, signSession } from "@/engine/auth/token";

export const runtime = "nodejs";

const body = z.object({ email: z.string().email(), password: z.string().min(1) });

/** Login com e-mail corporativo. Desafio: qualquer senha é aceita para funcionários cadastrados. */
export const POST = route(async (req) => {
  const { email } = await parseBody(req, body);
  const user = findEmployeeByEmail(email);
  if (!user) throw new AppError("INVALID_CREDENTIALS", "E-mail não encontrado", 401);
  const token = signSession({ sub: user.id, role: user.role });
  return Response.json({ token, user }, { headers: { "Set-Cookie": sessionCookie(token, { secure: isSecureRequest(req) }) } });
});
