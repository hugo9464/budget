import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Retour des liens email Supabase (réinitialisation du mot de passe).
 * Gère le flux PKCE (`code`, même navigateur) et le flux `token_hash`
 * (modèle d'email personnalisé, fonctionne depuis n'importe quel navigateur).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = params.get("next") ?? "/";
  // Redirection interne uniquement.
  const target = new URL(next.startsWith("/") && !next.startsWith("//") ? next : "/", request.url);
  const supabase = await createClient();

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("Lien incomplet") };

  if (error) return NextResponse.redirect(new URL("/unlock?link=expired", request.url));
  return NextResponse.redirect(target);
}
