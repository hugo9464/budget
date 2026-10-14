"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "./icon";

export function UnlockForm({ demo }: { demo: boolean }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function post(url: string, body: object) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({ error: "Erreur réseau" }));
    return { ok: response.ok, error: String(result.error ?? "") };
  }

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    setLoading(true); setError("");
    const result = await post("/api/session/code", { email });
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setCode(""); setStep("code");
    setTimeout(() => codeInput.current?.focus(), 0);
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    const result = await post("/api/session", { email, code });
    if (!result.ok) { setError(result.error); setCode(""); codeInput.current?.focus(); setLoading(false); return; }
    router.replace("/"); router.refresh();
  }

  if (step === "email") return <form className="unlock-card" onSubmit={sendCode}>
    <div className="unlock-icon"><Icon name="lock"/></div>
    <div><p className="eyebrow">ESPACE PERSONNEL</p><h1>Bienvenue chez vous</h1><p className="muted">Saisissez votre email pour recevoir un code de connexion.</p></div>
    <label htmlFor="email">Adresse email</label>
    <input className="email-input" id="email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="vous@exemple.fr" value={email} onChange={(event) => setEmail(event.target.value)} autoFocus required />
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="primary-button" disabled={loading || !email.includes("@")}>{loading ? "Envoi…" : "Recevoir un code"}<Icon name="chevron"/></button>
    <small><Icon name="lock"/> Session chiffrée et données privées</small>
  </form>;

  return <form className="unlock-card" onSubmit={verify}>
    <div className="unlock-icon"><Icon name="lock"/></div>
    <div><p className="eyebrow">VÉRIFICATION</p><h1>Consultez vos emails</h1><p className="muted">{demo ? <>Mode démo : utilisez le code <strong>123456</strong>.</> : <>Si <strong>{email}</strong> est autorisée, un code vient de lui être envoyé.</>}</p></div>
    <label htmlFor="code">Code reçu par email</label>
    <input ref={codeInput} id="code" name="code" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={10} placeholder="••••••" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="primary-button" disabled={loading || code.length < 6}>{loading ? "Vérification…" : "Se connecter"}<Icon name="chevron"/></button>
    <div className="unlock-links">
      <button type="button" className="link-button" onClick={() => { setStep("email"); setError(""); }}>Changer d’email</button>
      <button type="button" className="link-button" disabled={loading} onClick={() => sendCode()}>Renvoyer le code</button>
    </div>
    <small><Icon name="lock"/> Session chiffrée et données privées</small>
  </form>;
}
