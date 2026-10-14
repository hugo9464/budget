import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { isDemoMode } from "./env";
import { requestOrigin } from "./origin";
import { getSupabaseAdmin } from "./supabase/admin";
import { createClient } from "./supabase/server";

/** Cookie de session du seul mode démo ; en production la session est celle de Supabase Auth. */
export const SESSION_COOKIE = "budget_session";
const THIRTY_DAYS = 30 * 24 * 60 * 60;
const TWO_HOURS = 2 * 60 * 60;

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "demo-session-secret-change-me");
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ scope: "budget:owner" })
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

/** Identifiant et email de l'utilisateur Supabase connecté (hors mode démo). */
export async function currentUser(): Promise<{ id: string; email: string } | null> {
  if (isDemoMode()) return null;
  const { data, error } = await (await createClient()).auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: String(claims.email ?? "") };
}

export async function hasValidSession(): Promise<boolean> {
  if (!isDemoMode()) {
    // getClaims vérifie la signature du JWT ; ne pas utiliser getSession pour autoriser.
    const { data, error } = await (await createClient()).auth.getClaims();
    return !error && Boolean(data?.claims?.sub);
  }
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

/** Connecte l'utilisateur via Supabase Auth (cookies écrits par le client SSR). */
export async function signIn(email: string, password: string): Promise<boolean> {
  if (!email || !password) return false;
  if (isDemoMode()) {
    const expected = Buffer.from(DEMO_PASSWORD);
    const supplied = Buffer.from(password);
    return email.includes("@") && supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
  const { error } = await (await createClient()).auth.signInWithPassword({ email: email.trim(), password });
  return !error;
}

export async function signOut(): Promise<void> {
  if (!isDemoMode()) await (await createClient()).auth.signOut();
}

/**
 * Envoie l'email de réinitialisation Supabase. Le lien revient sur /auth/confirm,
 * qui ouvre une session de récupération puis redirige vers /reset-password.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  if (isDemoMode()) return;
  const redirectTo = new URL("/auth/confirm?next=/reset-password", await requestOrigin()).toString();
  const { error } = await (await createClient()).auth.resetPasswordForEmail(email.trim(), { redirectTo });
  // Ne révèle pas si l'adresse existe ; seules les erreurs techniques remontent.
  if (error && error.status !== 400 && error.status !== 404) throw error;
}

export async function updatePassword(password: string): Promise<string | null> {
  if (isDemoMode()) return "Indisponible en mode démo";
  const { error } = await (await createClient()).auth.updateUser({ password });
  if (!error) return null;
  if (error.code === "same_password") return "Choisissez un mot de passe différent de l’actuel.";
  if (error.code === "weak_password") return "Mot de passe trop faible.";
  if (error.code === "reauthentication_needed") return "Session trop ancienne : utilisez « Mot de passe oublié » pour recevoir un lien.";
  return "Impossible de modifier le mot de passe.";
}
