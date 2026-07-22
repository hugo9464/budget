"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { BankSyncStatus } from "@/lib/types";
import { Icon } from "./icon";

const nav = [
  { href: "/", label: "Accueil", icon: "chart" },
  { href: "/transactions", label: "Opérations", icon: "list" },
  { href: "/assistant", label: "Assistant", icon: "sparkles" },
  { href: "/budgets", label: "Budgets", icon: "wallet" },
  { href: "/categories", label: "Catégories", icon: "basket" },
  { href: "/settings", label: "Réglages", icon: "settings" },
];

function formatSyncDate(value: string | null): string {
  if (!value) return "jamais";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function quotaText(status: BankSyncStatus): string {
  if (status.quotaRemaining === null) return "Quota API : à mesurer";
  const plural = status.quotaRemaining > 1 ? "s" : "";
  if (status.quotaRemaining === 0 && status.quotaResetAt) {
    return `Quota API : 0 · retour ${formatSyncDate(status.quotaResetAt)}`;
  }
  return `Quota API : ${status.quotaRemaining} sync${plural} restante${plural}`;
}

export function AppShell({ children, syncStatus }: { children: React.ReactNode; syncStatus: BankSyncStatus }) {
  const pathname = usePathname();
  const router = useRouter();
  const [syncing, startTransition] = useTransition();
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  function syncNow() {
    startTransition(async () => {
      setSyncMessage("");
      const response = await fetch("/api/sync", { method: "POST" });
      const result = await response.json();
      setSyncMessage(response.ok ? (result.skipped ? "Déjà à jour" : `${result.imported} opération(s) actualisée(s)`) : result.error);
      router.refresh();
      window.setTimeout(() => setSyncMessage(""), 3500);
    });
  }

  const syncBlocked = syncStatus.quotaRemaining === 0 && Boolean(syncStatus.quotaResetAt);
  const syncButton = <button className="sync-button" onClick={syncNow} disabled={syncing || syncBlocked}><Icon name="refresh" className={syncing ? "spin" : ""}/>{syncing ? "Actualisation…" : syncBlocked ? "Quota épuisé" : "Synchroniser"}</button>;
  const syncMeta = <div className="sync-meta"><small>Dernière sync : {formatSyncDate(syncStatus.lastSyncedAt)}</small><small>{quotaText(syncStatus)}</small></div>;

  return <div className="app-frame">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark">M</span><span>Mon budget</span></Link>
      <nav className="desktop-nav" aria-label="Navigation principale">
        {nav.map((item) => <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
          <Icon name={item.icon}/><span>{item.label}</span>
        </Link>)}
      </nav>
      <div className="sidebar-sync">
        {syncButton}
        {syncMeta}
      </div>
    </aside>
    <main className="main-content">{syncMessage ? <div className="toast" role="status">{syncMessage}</div> : null}<div className="mobile-sync">{syncButton}{syncMeta}</div>{children}</main>
    <nav className="mobile-nav" aria-label="Navigation mobile">
      {nav.map((item) => <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
        <Icon name={item.icon}/><span>{item.label === "Opérations" ? "Opérations" : item.label}</span>
      </Link>)}
    </nav>
  </div>;
}
