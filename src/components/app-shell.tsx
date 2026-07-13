"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "./icon";

const nav = [
  { href: "/", label: "Accueil", icon: "chart" },
  { href: "/transactions", label: "Opérations", icon: "list" },
  { href: "/budgets", label: "Budgets", icon: "wallet" },
  { href: "/categories", label: "Catégories", icon: "basket" },
  { href: "/settings", label: "Réglages", icon: "settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [syncing, startTransition] = useTransition();
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const controller = new AbortController();
    fetch("/api/sync", { method: "POST", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (result && !result.skipped) router.refresh(); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [router]);

  function syncNow() {
    startTransition(async () => {
      setSyncMessage("");
      const response = await fetch("/api/sync?manual=true", { method: "POST" });
      const result = await response.json();
      setSyncMessage(response.ok ? (result.skipped ? "Déjà à jour" : `${result.imported} opération(s) actualisée(s)`) : result.error);
      if (response.ok) router.refresh();
      window.setTimeout(() => setSyncMessage(""), 3500);
    });
  }

  return <div className="app-frame">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark">M</span><span>Mon budget</span></Link>
      <nav className="desktop-nav" aria-label="Navigation principale">
        {nav.map((item) => <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
          <Icon name={item.icon}/><span>{item.label}</span>
        </Link>)}
      </nav>
      <div className="sidebar-sync">
        <button className="sync-button" onClick={syncNow} disabled={syncing}><Icon name="refresh" className={syncing ? "spin" : ""}/>{syncing ? "Actualisation…" : "Synchroniser"}</button>
        <small>Connexion sécurisée GoCardless</small>
      </div>
    </aside>
    <main className="main-content">{syncMessage ? <div className="toast" role="status">{syncMessage}</div> : null}{children}</main>
    <nav className="mobile-nav" aria-label="Navigation mobile">
      {nav.map((item) => <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
        <Icon name={item.icon}/><span>{item.label === "Opérations" ? "Opérations" : item.label}</span>
      </Link>)}
    </nav>
  </div>;
}
