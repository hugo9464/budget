import { AppShell } from "@/components/app-shell";
import { getBankSyncStatus } from "@/lib/data";
import { requirePageSession } from "@/lib/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // En parallèle : la redirection de requirePageSession l'emporte si la session est invalide.
  const [, syncStatus] = await Promise.all([requirePageSession(), getBankSyncStatus()]);
  return <AppShell syncStatus={syncStatus}>{children}</AppShell>;
}
