import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIpHash, isValidEmail, recordLoginAttempt, sendEmailCode } from "@/lib/session";

export async function POST(request: NextRequest) {
  const ipHash = await clientIpHash();
  const limit = await checkRateLimit(ipHash);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 15 minutes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "");
  if (!isValidEmail(email)) return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });

  // Chaque envoi compte dans la limite pour éviter de spammer la boîte mail.
  await recordLoginAttempt(ipHash, false);
  try {
    await sendEmailCode(email);
  } catch (error) {
    console.error("Envoi du code email impossible", error);
    return NextResponse.json({ error: "Impossible d’envoyer le code. Réessayez dans une minute." }, { status: 502 });
  }
  // Réponse identique que l'adresse soit autorisée ou non.
  return NextResponse.json({ ok: true });
}
