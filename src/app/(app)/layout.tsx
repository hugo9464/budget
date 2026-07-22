import { AppShell } from "@/components/app-shell";
import { getBankSyncStatus } from "@/lib/data";
import { requirePageSession } from "@/lib/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession();
  const syncStatus = await getBankSyncStatus();
  return <AppShell syncStatus={syncStatus}>{children}</AppShell>;
}
