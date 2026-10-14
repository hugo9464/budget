import { NextRequest, NextResponse } from "next/server";
import { currentUser, updatePassword } from "@/lib/session";

export async function POST(request: NextRequest) {
  if (!(await currentUser())) return NextResponse.json({ error: "Lien expiré. Refaites une demande." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const password = String(body.password ?? "");
  if (password.length < 8) return NextResponse.json({ error: "8 caractères minimum." }, { status: 400 });
  const error = await updatePassword(password);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
