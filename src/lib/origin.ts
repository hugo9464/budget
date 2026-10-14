import "server-only";
import { headers } from "next/headers";

/** Origine publique de la requête courante (production, preview Vercel ou local). */
export async function requestOrigin(): Promise<URL> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!host) throw new Error("Hôte de la requête introuvable");
  const proto = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return new URL(`${proto}://${host}`);
}
