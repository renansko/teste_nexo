"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MessageCircle, UserRound } from "lucide-react";
import { NexoMark } from "@/components/NexoMark";
import { Avatar } from "@/components/ui/Avatar";
import { initialsOf, useSession } from "@/components/session/SessionProvider";
import styles from "./ClientSidebar.module.css";

const NAV = [
  { href: "/atendimento", label: "Atendimento", Icon: MessageCircle },
  { href: "/perfil", label: "Meu perfil", Icon: UserRound },
];

export function ClientSidebar() {
  const pathname = usePathname();
  const { user, logout } = useSession();
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <NexoMark />
        <span>Nexo Assist</span>
      </div>
      <nav className={styles.nav}>
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={styles.item} data-active={active} aria-current={active ? "page" : undefined}>
              <Icon size={16} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className={styles.user}>
        <Avatar initials={initialsOf(user.name)} size={34} />
        <div className={styles.userText}>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
      </div>
      <button type="button" className={styles.item} onClick={() => void logout()}>
        <LogOut size={16} aria-hidden />
        Sair
      </button>
    </aside>
  );
}
