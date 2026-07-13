import { NextRequest, NextResponse } from "next/server";
import { syncBankData } from "@/lib/gocardless";
import { requireApiSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    const manual = request.nextUrl.searchParams.get("manual") === "true";
    return NextResponse.json(await syncBankData(manual ? "manual" : "app_open", manual));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Synchronisation impossible" }, { status: 503 });
  }
}
