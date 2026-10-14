import { redirect } from "next/navigation";
import { UnlockForm } from "@/components/unlock-form";
import { isDemoMode } from "@/lib/env";
import { hasValidSession } from "@/lib/session";

export default async function UnlockPage() {
  if (await hasValidSession()) redirect("/");
  return <main className="unlock-page">
    <div className="unlock-brand"><span className="brand-mark">M</span><span>Mon budget</span></div>
    <UnlockForm demo={isDemoMode()}/>
    <p className="unlock-footer">Vos finances restent vos finances.</p>
  </main>;
}
