import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
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
  return { allowed: (count ?? 0) < 10, retryAfter: (count ?? 0) < 10 ? 0 : 900 };
}

export async function recordLoginAttempt(ipHash: string, succeeded: boolean): Promise<void> {
  if (isDemoMode()) return;
  await getSupabaseAdmin().from("login_attempts").insert({ ip_hash: ipHash, succeeded });
}

export const DEMO_EMAIL_CODE = "123456";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/** Liste blanche des adresses autorisées (variable ALLOWED_EMAILS, séparées par des virgules). */
export function isAllowedEmail(email: string): boolean {
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
  if (!allowed.length) return isDemoMode();
  return allowed.includes(normalizeEmail(email));
}

/**
 * Client Supabase dédié à l'authentification, recréé à chaque appel :
 * verifyOtp mémorise la session de l'utilisateur dans le client, ce qui
 * remplacerait la clé secrète du client admin partagé.
 */
function authClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Envoie un code à usage unique par email. Les adresses non autorisées sont ignorées silencieusement. */
export async function sendEmailCode(email: string): Promise<void> {
  if (!isAllowedEmail(email) || isDemoMode()) return;
  const { error } = await authClient().auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, code: string): Promise<boolean> {
  if (!/^\d{6,10}$/.test(code) || !isAllowedEmail(email)) return false;
  if (isDemoMode()) {
    const expected = Buffer.from(DEMO_EMAIL_CODE);
    const supplied = Buffer.from(code);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
  const { data, error } = await authClient().auth.verifyOtp({ email: normalizeEmail(email), token: code, type: "email" });
  return !error && normalizeEmail(data.user?.email ?? "") === normalizeEmail(email);
}
