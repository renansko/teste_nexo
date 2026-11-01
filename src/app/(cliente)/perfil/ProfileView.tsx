"use client";
import { KeyRound, Lock, Mail, RotateCcwKey } from "lucide-react";
import { useSession } from "@/components/session/SessionProvider";
import styles from "./perfil.module.css";

export function ProfileView() {
  const { user } = useSession();
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header>
          <h1 className={styles.title}>Meu perfil</h1>
          <p className={styles.subtitle}>Seus dados de acesso ao service desk de TI.</p>
        </header>

        <section className={styles.card} aria-label="Dados">
          <div className={styles.row}>
            <span className={styles.key}>Nome</span>
            <span className={styles.value}>{user.name}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.key}>E-mail corporativo</span>
            <span className={styles.value}>{user.email}</span>
            <span className={styles.note}>
              <Lock size={13} aria-hidden />
              Gerenciado pela TI
            </span>
          </div>
          {user.department && (
            <div className={styles.row}>
              <span className={styles.key}>Departamento</span>
              <span className={styles.value}>{user.department}</span>
            </div>
          )}
        </section>

        <section className={styles.card} aria-label="Senha">
          <div className={styles.passwordRow}>
            <span className={styles.iconWrap}>
              <KeyRound size={18} aria-hidden />
            </span>
            <div className={styles.passwordText}>
              <strong>Senha</strong>
              <span>A mesma da rede Nexo.</span>
            </div>
            {/* A API não tem redefinição de senha: ação desabilitada até existir. */}
            <button type="button" className={styles.secondary} disabled title="Indisponível nesta versão">
              <RotateCcwKey size={15} aria-hidden />
              Redefinir senha
            </button>
          </div>
          <div className={styles.helper}>
            <Mail size={14} aria-hidden />
            Enviaremos um link de redefinição para {user.email}.
          </div>
        </section>
      </div>
    </div>
  );
}
