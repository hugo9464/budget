import type { Metadata } from "next";
import { AiCategorizationActions, BankActions, LogoutButton } from "@/components/settings-actions";
import { Icon } from "@/components/icon";
import { getAiCategorizationStatus } from "@/lib/ai-categorization";
import { formatCurrency } from "@/lib/budget";
import { getDashboardData } from "@/lib/data";

export const metadata: Metadata = { title: "Réglages" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ bank?: string; connected?: string }> }) {
  const params = await searchParams;
  const [data, ai] = await Promise.all([getDashboardData(), getAiCategorizationStatus()]);
  const connected = data.connection?.status === "linked";
  return <div className="page settings-page"><header className="page-header"><div><p className="eyebrow">CONFIGURATION</p><h1>Réglages</h1><p className="muted">Gérez votre banque, la synchronisation et la sécurité.</p></div></header>
    {params.bank === "connected" || params.connected === "demo" ? <div className="success-banner">BoursoBank est connecté. Vos opérations sont à jour.</div> : null}
    {params.bank === "error" ? <div className="error-banner">La connexion bancaire n’a pas pu être finalisée. Vous pouvez réessayer.</div> : null}
    <section className="settings-section card"><div className="settings-icon"><Icon name="bank"/></div><div className="settings-copy"><p className="eyebrow">CONNEXION BANCAIRE</p><h2>{data.connection?.institution_name ?? "BoursoBank"}</h2><p className="muted">{connected ? `${data.accounts.length} compte(s) synchronisé(s) via GoCardless.` : "Connectez votre compte sans partager vos identifiants avec l’application."}</p>
      <div className="connection-meta"><span className={`connection-status ${connected ? "ok" : ""}`}><i/>{connected ? "Connecté" : data.connection?.status === "expired" ? "Consentement expiré" : "Non connecté"}</span>{data.connection?.consent_expires_at ? <span>Renouvellement avant le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(data.connection.consent_expires_at))}</span> : null}{data.syncStatus.lastSyncedAt ? <span>Dernière synchro : {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.syncStatus.lastSyncedAt))}</span> : null}<span>{data.syncStatus.quotaRemaining === null ? "Quota API : disponible après la prochaine synchro" : `Quota API : ${data.syncStatus.quotaRemaining} synchronisation(s) restante(s)`}</span>{data.syncStatus.quotaResetAt ? <span>Quota renouvelé vers le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.syncStatus.quotaResetAt))}</span> : null}</div>
      {data.accounts.length ? <div className="connected-accounts">{data.accounts.map((account) => <div key={account.id}><span><strong>{account.name}</strong><small>{account.iban_masked ?? account.currency}</small></span><b>{formatCurrency(account.balance)}</b></div>)}</div> : null}
      {data.connection?.error_message ? <p className="form-error">{data.connection.error_message}</p> : null}<BankActions connected={connected} demo={data.demo} syncBlocked={data.syncStatus.quotaRemaining === 0 && Boolean(data.syncStatus.quotaResetAt)}/></div></section>
    <section className="settings-section card"><div className="settings-icon"><Icon name="sparkles"/></div><div className="settings-copy"><p className="eyebrow">CATÉGORISATION OPENAI</p><h2>Classement intelligent des opérations</h2><p className="muted">Les corrections manuelles, règles et heuristiques restent prioritaires. OpenAI analyse uniquement les {ai.pending} opération(s) encore inconnue(s), avec un libellé nettoyé et le sens revenu/dépense.</p><div className="connection-meta"><span className={`connection-status ${ai.configured ? "ok" : ""}`}><i/>{ai.configured ? "Clé API configurée" : "Clé API requise"}</span><span>Modèle économique adapté aux classements en volume</span></div><div className="privacy-pills"><span>IBAN et numéros supprimés</span><span>Aucun solde transmis</span><span>Corrections mémorisées</span></div><AiCategorizationActions configured={ai.configured} pending={ai.pending} model={ai.model}/>{!ai.configured ? <p className="inline-message">Créez une clé sur votre compte API OpenAI, puis ajoutez-la comme variable serveur <code>OPENAI_API_KEY</code> dans <code>.env.local</code> et Vercel. Ne la collez jamais dans l’interface.</p> : null}</div></section>
    <section className="settings-section card"><div className="settings-icon"><Icon name="lock"/></div><div className="settings-copy"><p className="eyebrow">SÉCURITÉ</p><h2>Code PIN et session privée</h2><p className="muted">La session est conservée 30 jours dans un cookie chiffré. Verrouillez l’application immédiatement sur un appareil partagé.</p><LogoutButton/></div></section>
    <section className="about-card"><span className="brand-mark">M</span><div><strong>Mon budget</strong><p>Version 0.1.0 · PWA personnelle</p></div></section>
  </div>;
}
