import { NextRequest, NextResponse } from "next/server";
import { deletePasskey } from "@/lib/passkeys";
import { currentUser } from "@/lib/session";

export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Identifiant manquant" }, { status: 400 });
  await deletePasskey(user.id, id);
  return NextResponse.json({ ok: true });
}
