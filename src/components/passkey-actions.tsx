"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "./icon";

function errorMessage(error: unknown, fallback: string): string {
  // Annulation par l'utilisateur : pas d'erreur à afficher.
  if (error instanceof WebAuthnError && error.code === "ERROR_CEREMONY_ABORTED") return "";
  if (error instanceof Error && error.name === "NotAllowedError") return "";
  if (error instanceof WebAuthnError && error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return "Cet appareil est déjà enregistré.";
  return fallback;
}

const noSubscription = () => () => {};

/** false au rendu serveur, puis détection réelle côté navigateur. */
function useWebAuthnSupport(): boolean {
  return useSyncExternalStore(noSubscription, browserSupportsWebAuthn, () => false);
}

export function PasskeyLoginButton({ onError }: { onError: (message: string) => void }) {
  const supported = useWebAuthnSupport();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  if (!supported) return null;

  async function login() {
    setLoading(true); onError("");
    try {
      const options = await fetch("/api/passkey/login").then((response) => response.json());
      if (options.error) throw new Error(options.error);
      const response = await startAuthentication({ optionsJSON: options });
      const result = await fetch("/api/passkey/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response }) });
      const body = await result.json().catch(() => ({}));
      if (!result.ok) { onError(body.error ?? "Connexion impossible"); setLoading(false); return; }
      router.replace("/"); router.refresh();
    } catch (error) {
      onError(errorMessage(error, "Touch ID n’a pas pu vous connecter. Utilisez votre mot de passe."));
      setLoading(false);
    }
  }

  return <>
    <button type="button" className="secondary-button passkey-button" onClick={login} disabled={loading}><Icon name="fingerprint"/>{loading ? "Vérification…" : "Se connecter avec Touch ID"}</button>
    <div className="unlock-divider"><span>ou avec votre mot de passe</span></div>
  </>;
}

type Passkey = { id: string; device_name: string; created_at: string; last_used_at: string | null };

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "Appareil";
}

export function PasskeySettings({ passkeys }: { passkeys: Passkey[] }) {
  const supported = useWebAuthnSupport();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const format = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));

  async function register() {
    setLoading(true); setMessage("");
    try {
      const options = await fetch("/api/passkey/register").then((response) => response.json());
      if (options.error) throw new Error(options.error);
      const response = await startRegistration({ optionsJSON: options });
      const result = await fetch("/api/passkey/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response, deviceName: defaultDeviceName() }) });
      const body = await result.json().catch(() => ({}));
      setMessage(result.ok ? "Touch ID est activé sur cet appareil." : body.error ?? "Enregistrement impossible");
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error, "Touch ID n’a pas pu être activé."));
    }
    setLoading(false);
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette passkey ? Vous ne pourrez plus vous connecter avec elle.")) return;
    await fetch(`/api/passkey?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    router.refresh();
  }

  return <div className="passkey-settings">
    {passkeys.length ? <div className="connected-accounts">{passkeys.map((passkey) => <div key={passkey.id}>
      <span><strong>{passkey.device_name}</strong><small>Ajoutée le {format(passkey.created_at)}{passkey.last_used_at ? ` · utilisée le ${format(passkey.last_used_at)}` : ""}</small></span>
      <button className="link-button" onClick={() => remove(passkey.id)}>Supprimer</button>
    </div>)}</div> : null}
    {supported ? <button className="primary-button" onClick={register} disabled={loading}><Icon name="fingerprint"/>{loading ? "En attente de Touch ID…" : "Activer Touch ID sur cet appareil"}</button> : <p className="inline-message">Ce navigateur ne gère pas les passkeys.</p>}
    {message ? <p className="inline-message">{message}</p> : null}
  </div>;
}
