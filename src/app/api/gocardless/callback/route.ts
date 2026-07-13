import { NextRequest, NextResponse } from "next/server";
import { completeBankConnection } from "@/lib/gocardless";
import { hasValidSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  if (!(await hasValidSession())) return NextResponse.redirect(new URL("/unlock", request.url));
  const connectionId = request.nextUrl.searchParams.get("connection");
  if (!connectionId) return NextResponse.redirect(new URL("/settings?bank=invalid", request.url));
  try {
    await completeBankConnection(connectionId);
    return NextResponse.redirect(new URL("/settings?bank=connected", request.url));
  } catch {
    return NextResponse.redirect(new URL("/settings?bank=error", request.url));
  }
}
