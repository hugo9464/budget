import Link from "next/link";
import { formatCurrency, formatShortDate } from "@/lib/budget";
import { getDashboardData } from "@/lib/data";
import { Icon } from "@/components/icon";

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(`${month}-01T12:00:00Z`));
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const data = await getDashboardData(params.month);
  const topLines = data.budgetLines.filter((line) => line.spent > 0).slice(0, 5);
  const maxSpent = Math.max(...topLines.map((line) => line.spent), 1);
  const budgetProgress = data.totalBudget ? Math.min((data.expenses / data.totalBudget) * 100, 100) : 0;
  return <div className="page dashboard-page">
    <header className="page-header">
      <div><p className="eyebrow">VUE D’ENSEMBLE</p><h1>Bonjour Hugo <span>👋</span></h1><p className="muted">Voici où en sont vos finances ce mois-ci.</p></div>
      <form className="month-picker"><label className="sr-only" htmlFor="month">Mois</label><input id="month" name="month" type="month" defaultValue={data.month}/><button>Afficher</button></form>
    </header>
    {data.demo ? <div className="demo-banner"><span>Mode démo</span> Connectez Supabase et GoCardless pour afficher vos comptes réels.<Link href="/settings">Configurer</Link></div> : null}
    <section className="balance-hero">
      <div><p>Solde total</p><strong>{formatCurrency(data.balance)}</strong><span><i className="status-dot"/> {data.accounts.length} compte{data.accounts.length > 1 ? "s" : ""} connecté{data.accounts.length > 1 ? "s" : ""}</span></div>
      <div className="hero-month"><p>{monthLabel(data.month)}</p><span>Mis à jour {data.lastSyncedAt ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(data.lastSyncedAt)) : "jamais"}</span></div>
    </section>
    <section className="metric-grid">
      <article className="metric card"><span className="metric-icon income"><Icon name="arrows"/></span><div><p>Revenus</p><strong>{formatCurrency(data.income)}</strong><small>Ce mois-ci</small></div></article>
      <article className="metric card"><span className="metric-icon expense"><Icon name="arrows"/></span><div><p>Dépenses</p><strong>{formatCurrency(data.expenses)}</strong><small className={(data.expenseDelta ?? 0) <= 0 ? "good" : "bad"}>{data.expenseDelta === null ? "Pas de comparaison" : `${data.expenseDelta > 0 ? "+" : ""}${data.expenseDelta.toFixed(1)} % vs mois dernier`}</small></div></article>
      <article className="metric card"><span className="metric-icon savings"><Icon name="piggy"/></span><div><p>Épargne nette</p><strong>{formatCurrency(data.savings)}</strong><small>{data.income ? `${Math.max(0, (data.savings / data.income) * 100).toFixed(0)} % de vos revenus` : "—"}</small></div></article>
      <article className="metric card budget-metric"><div className="mini-ring" style={{ "--progress": `${budgetProgress * 3.6}deg` } as React.CSSProperties}><span>{budgetProgress.toFixed(0)}%</span></div><div><p>Budget consommé</p><strong>{formatCurrency(data.expenses)}</strong><small>sur {formatCurrency(data.totalBudget)}</small></div></article>
    </section>
    <section className="dashboard-grid">
      <article className="card spending-card">
        <div className="card-heading"><div><p className="eyebrow">RÉPARTITION</p><h2>Vos dépenses</h2></div><Link href="/transactions">Tout voir <Icon name="chevron"/></Link></div>
        <div className="bar-chart">{topLines.length ? topLines.map((line) => <div className="bar-column" key={line.category.id}><div className="bar-value">{formatCurrency(line.spent)}</div><div className="bar-track"><span style={{ height: `${Math.max(8, line.spent / maxSpent * 100)}%`, background: line.category.color }}/></div><small>{line.category.name}</small></div>) : <div className="empty-state"><p>Aucune dépense comptabilisée.</p></div>}</div>
      </article>
      <article className="card budget-card">
        <div className="card-heading"><div><p className="eyebrow">BUDGET DU MOIS</p><h2>Reste à dépenser</h2></div><Link href="/budgets"><Icon name="chevron"/></Link></div>
        <strong className={data.remainingBudget < 0 ? "negative" : ""}>{formatCurrency(data.remainingBudget)}</strong>
        <p>sur {formatCurrency(data.totalBudget)} prévu</p>
        <div className="budget-progress"><span style={{ width: `${budgetProgress}%` }}/></div>
        <div className="budget-legend"><span>{formatCurrency(data.expenses)} dépensés</span><span>{(100 - budgetProgress).toFixed(0)} % restants</span></div>
        <hr/>
        {data.budgetLines.filter((line) => line.budget > 0).slice(0, 3).map((line) => <div className="mini-budget" key={line.category.id}><span style={{ background: line.category.color }}/><p>{line.category.name}</p><strong>{formatCurrency(line.remaining)}</strong></div>)}
      </article>
    </section>
    <section className="card recent-card">
      <div className="card-heading"><div><p className="eyebrow">DERNIÈRES OPÉRATIONS</p><h2>Mouvements récents</h2></div><Link href="/transactions">Toutes les opérations <Icon name="chevron"/></Link></div>
      {data.transactions.slice(0, 5).map((transaction) => <div className="transaction-row" key={transaction.id}><div className="category-dot" style={{ background: `${transaction.category?.color ?? "#aaa"}20`, color: transaction.category?.color }}><Icon name={transaction.category?.icon ?? "help"}/></div><div className="transaction-main"><strong>{transaction.counterparty || transaction.description}</strong><span>{formatShortDate(transaction.booked_at)} · {transaction.category?.name ?? "À classer"}{transaction.status === "pending" ? <em>En attente</em> : null}</span></div><strong className={transaction.amount > 0 ? "amount positive" : "amount"}>{transaction.amount > 0 ? "+" : "−"}{formatCurrency(Math.abs(transaction.amount))}</strong></div>)}
    </section>
  </div>;
}
