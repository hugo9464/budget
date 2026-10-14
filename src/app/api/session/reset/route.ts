import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIpHash, recordLoginAttempt, sendPasswordReset } from "@/lib/session";

export async function POST(request: NextRequest) {
  const ipHash = await clientIpHash();
  const limit = await checkRateLimit(ipHash);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 15 minutes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });
  // Chaque demande compte dans la limite pour éviter d'inonder la boîte mail.
  await recordLoginAttempt(ipHash, false);
  try {
    await sendPasswordReset(email);
  } catch (error) {
    console.error("Envoi de l’email de réinitialisation impossible", error);
    return NextResponse.json({ error: "Impossible d’envoyer l’email. Réessayez dans quelques minutes." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
