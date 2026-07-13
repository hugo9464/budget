import { AppShell } from "@/components/app-shell";
import { requirePageSession } from "@/lib/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession();
  return <AppShell>{children}</AppShell>;
}
