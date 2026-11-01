import { TopBar } from "@/components/client/TopBar";
import { ProfileView } from "./ProfileView";

export const metadata = { title: "Meu perfil · Nexo Assist" };

export default function PerfilPage() {
  return (
    <>
      <TopBar here="Meu perfil" />
      <ProfileView />
    </>
  );
}
