"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "./icon";

export function BankActions({ connected, demo }: { connected: boolean; demo: boolean }) {
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
      const response = await fetch("/api/sync?manual=true", { method: "POST" });
      const result = await response.json();
      setMessage(response.ok ? (result.skipped ? "Les comptes sont déjà à jour." : `${result.imported} opération(s) traitée(s).`) : result.error);
      if (response.ok) router.refresh();
    });
  }
  return <div className="settings-actions">
    <button className="primary-button" onClick={connect} disabled={pending}><Icon name="bank"/>{connected ? "Reconnecter BoursoBank" : demo ? "Tester la connexion" : "Connecter BoursoBank"}</button>
    {connected ? <button className="secondary-button" onClick={sync} disabled={pending}><Icon name="refresh"/>{pending ? "Actualisation…" : "Actualiser"}</button> : null}
    {message ? <p className="inline-message">{message}</p> : null}
  </div>;
}

export function LogoutButton() {
  const router = useRouter();
  return <button className="danger-button" onClick={async () => { await fetch("/api/session", { method: "DELETE" }); router.replace("/unlock"); router.refresh(); }}><Icon name="logout"/>Verrouiller l’application</button>;
}
