import { NextResponse } from "next/server";
import { createBankConnection } from "@/lib/gocardless";
import { requireApiSession } from "@/lib/session";

export async function POST() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.json({ url: await createBankConnection(appUrl) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Connexion impossible" }, { status: 500 });
  }
}
