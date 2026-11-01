/**
 * Funcionários (e analistas) da Nexo. Fonte do login e da privacidade de chamados.
 * @wiki docs/brain/entities/Employee.md
 */
import { getDb } from "@/lib/db";

export type EmployeeRole = "employee" | "analyst";

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  role: EmployeeRole;
}

interface Row { id: string; name: string; email: string; department: string; role: EmployeeRole }
const toEmployee = (r: Row): Employee => ({ id: r.id, name: r.name, email: r.email, department: r.department, role: r.role });

export function getEmployee(id: string): Employee | undefined {
  const r = getDb().prepare(`SELECT id, name, email, department, role FROM employees WHERE id = ?`).get(id) as Row | undefined;
  return r && toEmployee(r);
}

export function findEmployeeByEmail(email: string): Employee | undefined {
  const r = getDb().prepare(`SELECT id, name, email, department, role FROM employees WHERE lower(email) = lower(?)`).get(email.trim()) as Row | undefined;
  return r && toEmployee(r);
}

export function listEmployees(): Employee[] {
  return (getDb().prepare(`SELECT id, name, email, department, role FROM employees ORDER BY name`).all() as unknown as Row[]).map(toEmployee);
}

export function upsertEmployee(e: Employee): void {
  getDb().prepare(
    `INSERT INTO employees (id, name, email, department, role, created_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, department = excluded.department, role = excluded.role`,
  ).run(e.id, e.name, e.email, e.department, e.role, new Date().toISOString());
}
