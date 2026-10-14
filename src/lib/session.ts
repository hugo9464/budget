import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { isDemoMode, requireEnv } from "./env";
import { getSupabaseAdmin } from "./supabase/admin";

export const SESSION_COOKIE = "budget_session";
const THIRTY_DAYS = 30 * 24 * 60 * 60;
const TWO_HOURS = 2 * 60 * 60;

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "demo-session-secret-change-me");
}

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ scope: "budget:owner", email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${THIRTY_DAYS}s`)
    .setSubject("owner")
    .sign(secret());
}

export async function createBankCallbackToken(connectionId: string): Promise<string> {
  return new SignJWT({ scope: "budget:bank-callback" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TWO_HOURS}s`)
    .setSubject(connectionId)
    .sign(secret());
}

export async function verifyBankCallbackToken(token: string, connectionId: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.sub === connectionId && payload.scope === "budget:bank-callback";
  } catch {
    return false;
  }
}

export async function hasValidSession(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.sub === "owner" && payload.scope === "budget:owner";
  } catch {
    return false;
  }
}

export async function requirePageSession(): Promise<void> {
  if (!(await hasValidSession())) redirect("/unlock");
}

export async function requireApiSession(): Promise<Response | null> {
  return (await hasValidSession()) ? null : Response.json({ error: "Session expirée" }, { status: 401 });
}

export async function clientIpHash(): Promise<string> {
  const headerStore = await headers();
  const ip = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return createHash("sha256").update(`${ip}:${process.env.SESSION_SECRET ?? "demo"}`).digest("hex");
}

export async function checkRateLimit(ipHash: string): Promise<{ allowed: boolean; retryAfter: number }> {
  if (isDemoMode()) return { allowed: true, retryAfter: 0 };
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count, error } = await getSupabaseAdmin()
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("succeeded", false)
    .gte("attempted_at", cutoff);
  if (error) throw error;
  return { allowed: (count ?? 0) < 5, retryAfter: (count ?? 0) < 5 ? 0 : 900 };
}

export async function recordLoginAttempt(ipHash: string, succeeded: boolean): Promise<void> {
  if (isDemoMode()) return;
  await getSupabaseAdmin().from("login_attempts").insert({ ip_hash: ipHash, succeeded });
}

export const DEMO_PASSWORD = "demo1234";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Vérifie l'email et le mot de passe du propriétaire (AUTH_EMAIL / AUTH_PASSWORD_HASH).
 * En mode démo sans configuration : n'importe quel email avec le mot de passe « demo1234 ».
 */
export async function verifyCredentials(email: string, password: string): Promise<boolean> {
  if (!password || password.length > 200) return false;
  const configuredEmail = process.env.AUTH_EMAIL;
  const configuredHash = process.env.AUTH_PASSWORD_HASH;
  if (configuredEmail && configuredHash) {
    // Le hash est toujours comparé pour garder un temps de réponse constant.
    const passwordOk = await bcrypt.compare(password, configuredHash);
    return safeEqual(normalizeEmail(email), normalizeEmail(configuredEmail)) && passwordOk;
  }
  if (!isDemoMode()) {
    requireEnv("AUTH_EMAIL");
    requireEnv("AUTH_PASSWORD_HASH");
  }
  return email.includes("@") && safeEqual(password, DEMO_PASSWORD);
}
