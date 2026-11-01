"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type SessionUser, type UserRole } from "@/lib/api";

interface SessionValue {
  user: SessionUser;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession fora do SessionProvider");
  return value;
}

/** Home de cada papel depois do login. */
export const HOME_BY_ROLE: Record<UserRole, string> = { employee: "/atendimento", analyst: "/atendente" };

/**
 * Exige sessão válida (cookie `nexo_session`) para renderizar os filhos.
 * Sem sessão, ou com papel diferente de `role`, manda para a tela certa.
 */
export function SessionProvider({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser>();

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then(({ user }) => {
        if (!alive) return;
        if (user.role !== role) router.replace(HOME_BY_ROLE[user.role]);
        else setUser(user);
      })
      .catch(() => alive && router.replace("/entrar"));
    return () => {
      alive = false;
    };
  }, [role, router]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    router.replace("/entrar");
  }, [router]);

  if (!user) return null;
  return <SessionContext.Provider value={{ user, logout }}>{children}</SessionContext.Provider>;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
