import { redirect } from "next/navigation";
import { UnlockForm } from "@/components/unlock-form";
import { hasValidSession } from "@/lib/session";

export default async function UnlockPage() {
  if (await hasValidSession()) redirect("/");
  return <main className="unlock-page">
    <div className="unlock-brand"><span className="brand-mark">M</span><span>Mon budget</span></div>
    <UnlockForm/>
    <p className="unlock-footer">Vos finances restent vos finances.</p>
  </main>;
}
