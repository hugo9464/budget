import { NextRequest, NextResponse } from "next/server";
import { registrationOptions, verifyRegistration } from "@/lib/passkeys";
import { currentUser } from "@/lib/session";

/** GET : options d'enregistrement. POST : vérifie et enregistre la passkey. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  return NextResponse.json(await registrationOptions(user));
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!body.response) return NextResponse.json({ error: "Réponse manquante" }, { status: 400 });
  const ok = await verifyRegistration(user, body.response, String(body.deviceName ?? ""));
  if (!ok) return NextResponse.json({ error: "Enregistrement refusé. Réessayez." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
