"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "./icon";

export function UnlockForm() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error); setPin(""); input.current?.focus(); setLoading(false); return; }
    router.replace("/"); router.refresh();
  }

  return <form className="unlock-card" onSubmit={unlock}>
    <div className="unlock-icon"><Icon name="lock"/></div>
    <div><p className="eyebrow">ESPACE PERSONNEL</p><h1>Bienvenue chez vous</h1><p className="muted">Saisissez votre code pour accéder à votre budget.</p></div>
    <label htmlFor="pin">Code PIN</label>
    <input ref={input} id="pin" name="pin" inputMode="numeric" pattern="[0-9]*" autoComplete="current-password" maxLength={8} placeholder="••••" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} autoFocus />
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="primary-button" disabled={loading || pin.length < 4}>{loading ? "Vérification…" : "Déverrouiller"}<Icon name="chevron"/></button>
    <small><Icon name="lock"/> Session chiffrée et données privées</small>
  </form>;
}
