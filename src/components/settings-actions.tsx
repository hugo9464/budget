"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "./icon";

export function BankActions({ connected, demo, syncBlocked }: { connected: boolean; demo: boolean; syncBlocked: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  function connect() {
    startTransition(async () => {
      setMessage("");
      const response = await fetch("/api/gocardless/connect", { method: "POST" });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error); return; }
      window.location.assign(result.url);
    });
  }
  function sync() {
    startTransition(async () => {
      const response = await fetch("/api/sync", { method: "POST" });
      const result = await response.json();
      setMessage(response.ok ? (result.skipped ? "Les comptes sont déjà à jour." : `${result.imported} opération(s) traitée(s).`) : result.error);
      if (response.ok) router.refresh();
    });
  }
  return <div className="settings-actions">
    <button className="primary-button" onClick={connect} disabled={pending}><Icon name="bank"/>{connected ? "Reconnecter BoursoBank" : demo ? "Tester la connexion" : "Connecter BoursoBank"}</button>
    {connected ? <button className="secondary-button" onClick={sync} disabled={pending || syncBlocked}><Icon name="refresh"/>{pending ? "Actualisation…" : syncBlocked ? "Quota épuisé" : "Synchroniser"}</button> : null}
    {message ? <p className="inline-message">{message}</p> : null}
  </div>;
}

export function AiCategorizationActions({ configured, pending, model }: { configured: boolean; pending: number; model: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();

  function categorize() {
    startTransition(async () => {
      setMessage("");
      const response = await fetch("/api/categorize", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || "Catégorisation OpenAI impossible.");
        return;
      }
      setMessage(`${result.classified} opération(s) classée(s), ${result.uncertain} à vérifier${result.remaining ? `, ${result.remaining} restante(s)` : ""}.`);
      router.refresh();
    });
  }

  return <div className="settings-actions">
    {configured ? <button className="primary-button" onClick={categorize} disabled={isPending || pending === 0}><Icon name="sparkles"/>{isPending ? "Analyse en cours…" : pending ? `Analyser ${pending} opération(s)` : "Tout est analysé"}</button> : <a className="primary-button" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer"><Icon name="sparkles"/>Créer une clé API</a>}
    <span className="model-pill">{model}</span>
    {message ? <p className="inline-message">{message}</p> : null}
  </div>;
}

export function LogoutButton() {
  const router = useRouter();
  return <button className="danger-button" onClick={async () => { await fetch("/api/session", { method: "DELETE" }); router.replace("/unlock"); router.refresh(); }}><Icon name="logout"/>Verrouiller l’application</button>;
}
