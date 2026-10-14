"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "./icon";
import { PasskeyLoginButton } from "./passkey-actions";

export function UnlockForm({ demo }: { demo: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
    <small><Icon name="lock"/> Session chiffrée et données privées</small>
  </form>;
}
