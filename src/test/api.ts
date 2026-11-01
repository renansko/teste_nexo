/** Cliente de teste para os route handlers (sem subir o Next). */
import { signSession } from "@/engine/auth/token";
import type { EmployeeRole } from "@/services/employees/employeeService";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: Request, ctx: any) => Promise<Response>;

export function as(userId: string, role: EmployeeRole = "employee"): Record<string, string> {
  return { authorization: `Bearer ${signSession({ sub: userId, role })}` };
}

export async function call(
  handler: Handler,
  opts: { method?: string; url?: string; body?: unknown; headers?: Record<string, string>; params?: Record<string, string> } = {},
): Promise<{ status: number; json: any; res: Response }> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const req = new Request(opts.url ?? "http://localhost/api", { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json, res };
}
