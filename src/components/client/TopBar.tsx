import { ChevronRight } from "lucide-react";
import { StatusPill, type Tone } from "@/components/ui/StatusPill";
import styles from "./TopBar.module.css";

export function TopBar({ here, status }: { here: string; status?: { tone: Tone; label: string } }) {
  return (
    <header className={styles.bar}>
      <div className={styles.crumb}>
        <span className={styles.root}>Service desk de TI</span>
        <ChevronRight size={14} aria-hidden className={styles.sep} />
        <span className={styles.here}>{here}</span>
      </div>
      {status && <StatusPill tone={status.tone} label={status.label} />}
    </header>
  );
}
