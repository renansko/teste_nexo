import { NexoMark } from "@/components/NexoMark";
import { LoginForm } from "./LoginForm";
import styles from "./entrar.module.css";

export const metadata = { title: "Entrar · Nexo Assist" };

// Números de vitrine do protótipo. Estáticos até existir uma métrica real no backend.
const SHOWCASE_STATS = [
  { value: "8 s", label: "primeira resposta, em média" },
  { value: "72%", label: "resolvidos sem fila" },
];

export default function EntrarPage() {
  return (
    <div className={styles.screen}>
      <section className={styles.showcase} aria-label="Sobre o Nexo Assist">
        <div className={styles.brand}>
          <NexoMark size={24} color="#FFFFFF" />
          Nexo Assist
        </div>

        <div className={styles.story}>
          <div className={styles.headline}>
            <span className={styles.eyebrow}>Service desk de TI da Nexo</span>
            <h2 className={styles.display}>Seu problema de TI, resolvido em uma conversa.</h2>
            <p className={styles.body}>
              Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um
              analista quando precisa.
            </p>
          </div>

          <div className={styles.preview} aria-hidden>
            <div className={styles.previewUser}>Meu notebook não conecta na VPN. Erro 809.</div>
            <div className={styles.previewWho}>
              <strong>Nexo Assist</strong>
              <span>consultou seus chamados · criou um chamado</span>
            </div>
            <div className={styles.previewAgent}>
              Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
            </div>
            <div className={styles.chip}>
              <i />
              <strong>INC-20517</strong>
              <span>Rede e VPN · Alta · em até 4 h</span>
            </div>
          </div>
        </div>

        <dl className={styles.stats}>
          {SHOWCASE_STATS.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.signIn}>
        <p className={styles.help}>
          Problema para entrar? <a href="tel:4000">Ligue no ramal 4000</a>
        </p>
        <div className={styles.center}>
          <LoginForm />
        </div>
        <footer className={styles.footer}>
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </div>
  );
}
