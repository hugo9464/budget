"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./icon";

export function NewPasswordForm({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmation) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setLoading(true); setError("");
    const response = await fetch("/api/session/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const result = await response.json().catch(() => ({ error: "Erreur réseau" }));
    if (!response.ok) { setError(result.error); setLoading(false); return; }
    router.replace("/"); router.refresh();
  }

  return <form className="unlock-card" onSubmit={submit}>
    <div className="unlock-icon"><Icon name="lock"/></div>
    <div><p className="eyebrow">SÉCURITÉ</p><h1>Nouveau mot de passe</h1><p className="muted">Choisissez un nouveau mot de passe{email ? <> pour <strong>{email}</strong></> : null}.</p></div>
    <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
    <label htmlFor="password">Nouveau mot de passe</label>
    <input className="text-input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} placeholder="8 caractères minimum" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required />
    <label htmlFor="confirmation">Confirmation</label>
    <input className="text-input" id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="primary-button" disabled={loading || password.length < 8 || !confirmation}>{loading ? "Enregistrement…" : "Enregistrer le mot de passe"}<Icon name="chevron"/></button>
  </form>;
}
