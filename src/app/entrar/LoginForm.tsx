"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { HOME_BY_ROLE } from "@/components/session/SessionProvider";
import { api, ApiError } from "@/lib/api";
import styles from "./entrar.module.css";

/**
 * Login com e-mail corporativo. A sessão fica no cookie httpOnly `nexo_session`
 * definido pelo backend; o front só redireciona conforme o papel.
 */
export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
      setError("Informe seu e-mail corporativo e a senha.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const { user } = await api.login(email, password);
      router.replace(HOME_BY_ROLE[user.role]);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "E-mail ou senha incorretos."
          : "Não foi possível entrar agora. Tente de novo em instantes.",
      );
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div>
        <h1 className={styles.title}>Entrar</h1>
        <p className={styles.subtitle}>Use seu e-mail corporativo e a senha da rede Nexo.</p>
      </div>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.labelRow}>E-mail corporativo</span>
          <span className={styles.input}>
            <Mail size={16} aria-hidden />
            <input name="email" type="email" autoComplete="username" placeholder="nome@nexo.com.br" required />
          </span>
        </label>

        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor="password">Senha</label>
            <a href="tel:4000" className={styles.link}>Esqueci minha senha</a>
          </div>
          <span className={styles.input}>
            <LockKeyhole size={16} aria-hidden />
            <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required />
            <button
              type="button"
              className={styles.toggle}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </div>

        <label className={styles.remember}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span className={styles.checkbox} aria-hidden>
            {remember && <Check size={12} />}
          </span>
          Manter conectado neste computador
        </label>
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      <button type="submit" className={styles.primary} disabled={busy}>
        {busy ? "Entrando…" : "Entrar"}
        <ArrowRight size={16} aria-hidden />
      </button>
    </form>
  );
}
