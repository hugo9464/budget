import { NextRequest, NextResponse } from "next/server";
import { completeBankConnection } from "@/lib/gocardless";
import { hasValidSession, verifyBankCallbackToken } from "@/lib/session";

export async function GET(request: NextRequest) {
  const connectionId = request.nextUrl.searchParams.get("connection");
  if (!connectionId) return NextResponse.redirect(new URL("/settings?bank=invalid", request.url));
  const callbackToken = request.nextUrl.searchParams.get("token");
  const authorized = (await hasValidSession())
    || Boolean(callbackToken && await verifyBankCallbackToken(callbackToken, connectionId));
  if (!authorized) return NextResponse.redirect(new URL("/unlock", request.url));
  try {
    await completeBankConnection(connectionId);
    return NextResponse.redirect(new URL("/settings?bank=connected", request.url));
  } catch {
    return NextResponse.redirect(new URL("/settings?bank=error", request.url));
  }
}
