import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import { requestOrigin } from "./origin";
import { getSupabaseAdmin } from "./supabase/admin";
import { createClient } from "./supabase/server";

const CHALLENGE_COOKIE = "budget_webauthn";
const RP_NAME = "Mon budget";

export type PasskeySummary = { id: string; device_name: string; created_at: string; last_used_at: string | null };

type StoredPasskey = {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string[];
};

/**
 * Origine et RP ID déduits de l'hôte de la requête : une passkey est liée par le
 * navigateur au domaine sur lequel elle a été créée (production, preview ou local).
 */
async function relyingParty(): Promise<{ origin: string; rpID: string }> {
  const url = await requestOrigin();
  return { origin: url.origin, rpID: url.hostname };
}

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "demo-session-secret-change-me");
}

/** Le challenge est conservé 5 minutes dans un cookie signé, lié à l'opération en cours. */
async function storeChallenge(challenge: string, purpose: "register" | "login", userId?: string) {
  const token = await new SignJWT({ challenge, purpose, uid: userId ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
  (await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/passkey",
    maxAge: 300,
  });
}

async function consumeChallenge(purpose: "register" | "login", userId?: string): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CHALLENGE_COOKIE)?.value;
  cookieStore.set(CHALLENGE_COOKIE, "", { path: "/api/passkey", maxAge: 0 });
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.purpose !== purpose || (payload.uid ?? undefined) !== userId) return null;
    return typeof payload.challenge === "string" ? payload.challenge : null;
  } catch {
    return null;
  }
}

/** null si la migration des passkeys n'a pas encore été appliquée. */
export async function listPasskeys(userId: string): Promise<PasskeySummary[] | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("passkeys")
    .select("id, device_name, created_at, last_used_at")
    .eq("user_id", userId)
    .order("created_at");
  if (error?.code === "PGRST205" || error?.code === "42P01") return null;
  if (error) throw error;
  return data ?? [];
}

export async function deletePasskey(userId: string, id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("passkeys").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

export async function registrationOptions(user: { id: string; email: string }) {
  const { rpID } = await relyingParty();
  const { data, error } = await getSupabaseAdmin().from("passkeys").select("id, transports").eq("user_id", user.id);
  if (error) throw error;
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.email || user.id,
    userID: isoUint8Array.fromUTF8String(user.id),
    attestationType: "none",
    excludeCredentials: (data ?? []).map((row) => ({ id: row.id, transports: row.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await storeChallenge(options.challenge, "register", user.id);
  return options;
}

export async function verifyRegistration(user: { id: string }, response: RegistrationResponseJSON, deviceName: string): Promise<boolean> {
  const expectedChallenge = await consumeChallenge("register", user.id);
  if (!expectedChallenge) return false;
  const { origin, rpID } = await relyingParty();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!verification?.verified) return false;
  const { credential } = verification.registrationInfo;
  const { error } = await getSupabaseAdmin().from("passkeys").insert({
    id: credential.id,
    user_id: user.id,
    public_key: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? response.response.transports ?? [],
    device_name: deviceName.slice(0, 60) || "Appareil",
  });
  if (error) throw error;
  return true;
}

export async function authenticationOptions() {
  const { rpID } = await relyingParty();
  // Pas d'allowCredentials : passkeys découvrables, l'utilisateur n'a rien à saisir.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  await storeChallenge(options.challenge, "login");
  return options;
}

/**
 * Vérifie la signature de la passkey puis ouvre une session Supabase Auth classique :
 * un lien magique est généré côté serveur (jamais envoyé) et immédiatement échangé.
 */
export async function verifyAuthentication(response: AuthenticationResponseJSON): Promise<boolean> {
  const expectedChallenge = await consumeChallenge("login");
  if (!expectedChallenge) return false;
  const admin = getSupabaseAdmin();
  const { data: stored, error } = await admin
    .from("passkeys")
    .select("id, user_id, public_key, counter, transports")
    .eq("id", response.id)
    .maybeSingle<StoredPasskey>();
  if (error) throw error;
  if (!stored) return false;

  const { origin, rpID } = await relyingParty();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: stored.id,
      publicKey: isoBase64URL.toBuffer(stored.public_key),
      counter: Number(stored.counter),
      transports: stored.transports,
    },
  }).catch(() => null);
  if (!verification?.verified) return false;

  await admin
    .from("passkeys")
    .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq("id", stored.id);

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(stored.user_id);
  const email = userData?.user?.email;
  if (userError || !email) return false;
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link.properties?.hashed_token) return false;
  const { error: sessionError } = await (await createClient()).auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  return !sessionError;
}
