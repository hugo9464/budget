import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewPasswordForm } from "@/components/new-password-form";
import { currentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Nouveau mot de passe" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/unlock?link=expired");
  return <main className="unlock-page">
    <div className="unlock-brand"><span className="brand-mark">M</span><span>Mon budget</span></div>
    <NewPasswordForm email={user.email}/>
    <p className="unlock-footer">Vos finances restent vos finances.</p>
  </main>;
}
