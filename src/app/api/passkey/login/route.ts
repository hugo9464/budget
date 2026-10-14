import { NextRequest, NextResponse } from "next/server";
import { isDemoMode } from "@/lib/env";
import { authenticationOptions, verifyAuthentication } from "@/lib/passkeys";
import { checkRateLimit, clientIpHash, recordLoginAttempt } from "@/lib/session";

const unavailable = () => NextResponse.json({ error: "Touch ID indisponible en mode démo" }, { status: 400 });

/** GET : challenge de connexion. POST : vérifie la passkey et ouvre la session Supabase. */
export async function GET() {
  if (isDemoMode()) return unavailable();
  return NextResponse.json(await authenticationOptions());
}

export async function POST(request: NextRequest) {
  if (isDemoMode()) return unavailable();
  const ipHash = await clientIpHash();
  const limit = await checkRateLimit(ipHash);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 15 minutes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const body = await request.json().catch(() => ({}));
  const valid = Boolean(body.response) && await verifyAuthentication(body.response);
  await recordLoginAttempt(ipHash, valid);
  if (!valid) return NextResponse.json({ error: "Passkey non reconnue. Utilisez votre mot de passe." }, { status: 401 });
  return NextResponse.json({ ok: true });
}
