"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "./icon";
import { PasskeyLoginButton } from "./passkey-actions";

export function UnlockForm({ demo, linkExpired = false }: { demo: boolean; linkExpired?: boolean }) {
  const [mode, setMode] = useState<"login" | "forgot" | "sent">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(linkExpired ? "Ce lien a expiré ou a déjà été utilisé. Refaites une demande." : "");
  const [loading, setLoading] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const result = await response.json().catch(() => ({ error: "Erreur réseau" }));
    if (!response.ok) { setError(result.error); setPassword(""); passwordInput.current?.focus(); setLoading(false); return; }
    router.replace("/"); router.refresh();
  }

  async function requestReset(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    const response = await fetch("/api/session/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const result = await response.json().catch(() => ({ error: "Erreur réseau" }));
    setLoading(false);
    if (!response.ok) { setError(result.error); return; }
    setMode("sent");
  }

  const backToLogin = <button type="button" className="link-button unlock-link" onClick={() => { setMode("login"); setError(""); }}>Retour à la connexion</button>;

  if (mode === "sent") return <div className="unlock-card">
    <div className="unlock-icon"><Icon name="lock"/></div>
    <div><p className="eyebrow">EMAIL ENVOYÉ</p><h1>Consultez vos emails</h1><p className="muted">Si un compte existe pour <strong>{email}</strong>, un lien pour choisir un nouveau mot de passe vient d’être envoyé. Ouvrez-le de préférence dans ce navigateur.</p></div>
    {backToLogin}
  </div>;

  if (mode === "forgot") return <form className="unlock-card" onSubmit={requestReset}>
    <div className="unlock-icon"><Icon name="lock"/></div>
    <div><p className="eyebrow">MOT DE PASSE OUBLIÉ</p><h1>Réinitialisation</h1><p className="muted">Saisissez votre email pour recevoir un lien de réinitialisation.</p></div>
    <label htmlFor="reset-email">Adresse email</label>
    <input className="text-input" id="reset-email" name="email" type="email" inputMode="email" autoComplete="username" placeholder="vous@exemple.fr" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus required />
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="primary-button" disabled={loading || !email.includes("@")}>{loading ? "Envoi…" : "Envoyer le lien"}<Icon name="chevron"/></button>
    {backToLogin}
  </form>;

  return <form className="unlock-card" onSubmit={login}>
    <div className="unlock-icon"><Icon name="lock"/></div>
    <div><p className="eyebrow">ESPACE PERSONNEL</p><h1>Bienvenue chez vous</h1><p className="muted">{demo ? <>Mode démo : n’importe quel email et le mot de passe <strong>demo1234</strong>.</> : "Connectez-vous pour accéder à votre budget."}</p></div>
    {!demo ? <PasskeyLoginButton onError={setError}/> : null}
    <label htmlFor="email">Adresse email</label>
    <input className="text-input" id="email" name="email" type="email" inputMode="email" autoComplete="username" placeholder="vous@exemple.fr" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus required />
    <label htmlFor="password">Mot de passe</label>
    <input ref={passwordInput} className="text-input" id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} required />
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="primary-button" disabled={loading || !email.includes("@") || !password}>{loading ? "Vérification…" : "Se connecter"}<Icon name="chevron"/></button>
    {!demo ? <button type="button" className="link-button unlock-link" onClick={() => { setMode("forgot"); setError(""); }}>Mot de passe oublié ?</button> : null}
    <small><Icon name="lock"/> Session chiffrée et données privées</small>
  </form>;
}
