import { NextResponse } from "next/server";
import { syncBankData } from "@/lib/gocardless";
import { requireApiSession } from "@/lib/session";

export async function POST() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json(await syncBankData());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Synchronisation impossible" }, { status: 503 });
  }
}
