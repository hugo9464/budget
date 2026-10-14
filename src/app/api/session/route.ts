import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  checkRateLimit,
  clientIpHash,
  createSessionToken,
  normalizeEmail,
  recordLoginAttempt,
  verifyEmailCode,
} from "@/lib/session";

export async function POST(request: NextRequest) {
  const ipHash = await clientIpHash();
  const limit = await checkRateLimit(ipHash);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 15 minutes." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "");
  const valid = await verifyEmailCode(email, String(body.code ?? ""));
  await recordLoginAttempt(ipHash, valid);
  if (!valid) return NextResponse.json({ error: "Code incorrect ou expiré" }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(normalizeEmail(email)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
