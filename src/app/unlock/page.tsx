import { redirect } from "next/navigation";
import { UnlockForm } from "@/components/unlock-form";
import { isDemoMode } from "@/lib/env";
import { hasValidSession } from "@/lib/session";

export default async function UnlockPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  if (await hasValidSession()) redirect("/");
  return <main className="unlock-page">
    <div className="unlock-brand"><span className="brand-mark">M</span><span>Mon budget</span></div>
    <UnlockForm demo={isDemoMode()} linkExpired={link === "expired"}/>
    <p className="unlock-footer">Vos finances restent vos finances.</p>
  </main>;
}
