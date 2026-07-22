import Link from "next/link";
import { currentMonth, formatCurrency, formatShortDate } from "@/lib/budget";
import { getDashboardData } from "@/lib/data";
import { Icon } from "@/components/icon";
import { CategorySpendingChart } from "@/components/category-spending-chart";
import { CategorySpendingView } from "@/components/category-spending-view";

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(`${month}-01T12:00:00Z`));
}

function monthPeriodLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0, 12));
  const endLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(lastDay);
  return `Du 1er au ${endLabel}`;
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const data = await getDashboardData(params.month);
  const spendingSeries = data.spendingAnalytics.series.filter((item) => item.category.kind === "expense");
  const currentMonthSelected = data.month === currentMonth();
  const previousMonth = shiftMonth(data.month, -1);
  const nextMonth = shiftMonth(data.month, 1);
  const canGoToNextMonth = data.month < currentMonth();
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
    <section className="account-summary-grid" aria-label="Comptes connectés">
      {data.accounts.map((account) => <article className="account-summary card" key={account.id}><div><p>{account.name}</p><span>{account.iban_masked ?? account.currency}</span></div><strong>{formatCurrency(account.balance)}</strong></article>)}
    </section>
    <section className="dashboard-grid">
      <article className="card category-spending-card">
        <div className="card-heading"><div><div className="month-stepper"><Link href={`/?month=${previousMonth}`} aria-label={`Afficher ${monthLabel(previousMonth)}`} title={`Mois précédent : ${monthLabel(previousMonth)}`}><Icon name="chevron"/></Link><p className="eyebrow">{currentMonthSelected ? "MOIS EN COURS" : monthLabel(data.month)}</p>{canGoToNextMonth ? <Link href={`/?month=${nextMonth}`} aria-label={`Afficher ${monthLabel(nextMonth)}`} title={`Mois suivant : ${monthLabel(nextMonth)}`}><Icon name="chevron"/></Link> : <span className="month-stepper-disabled" aria-label="Le mois en cours est le plus récent" aria-disabled="true"><Icon name="chevron"/></span>}</div><h2>Dépenses par catégorie</h2></div><Link href="/transactions">Tout voir <Icon name="chevron"/></Link></div>
        <p className="analytics-period">{monthPeriodLabel(data.month)}</p>
        <CategorySpendingView items={data.categorySpending.map((item) => ({
          id: item.category.id,
          name: item.category.name,
          color: item.category.color,
          amount: item.amount,
          operations: item.transactions.map((transaction) => ({
            id: transaction.id,
            label: transaction.counterparty || transaction.description,
            date: formatShortDate(transaction.booked_at ?? transaction.value_at),
            amount: Math.abs(transaction.amount),
          })),
        }))}>
          <div className="category-spending-grid">{data.categorySpending.length ? data.categorySpending.map((item) => {
          const popoverId = `category-operations-${item.category.id}`;
          return <div className="category-spending-item" key={item.category.id}>
            <div className="category-spending-row" tabIndex={0} aria-describedby={popoverId}>
              <span style={{ background: item.category.color }}/>
              <div className="category-spending-copy"><p>{item.category.name}</p><small>{item.transactions.length} opération{item.transactions.length > 1 ? "s" : ""}</small></div>
              <strong>{formatCurrency(item.amount)}</strong>
            </div>
            <div className="category-spending-popover" id={popoverId} role="tooltip">
              <div className="category-popover-heading"><div><span style={{ background: item.category.color }}/><strong>{item.category.name}</strong></div><b>{formatCurrency(item.amount)}</b></div>
              <ul>{item.transactions.map((transaction) => <li key={transaction.id}><div><strong>{transaction.counterparty || transaction.description}</strong><small>{formatShortDate(transaction.booked_at ?? transaction.value_at)}</small></div><b>−{formatCurrency(Math.abs(transaction.amount))}</b></li>)}</ul>
            </div>
          </div>;
          }) : <div className="empty-state"><p>Aucune dépense comptabilisée sur ce mois.</p></div>}</div>
        </CategorySpendingView>
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
    <section className="card trend-card">
      <div className="card-heading"><div><p className="eyebrow">ÉVOLUTION</p><h2>Dépenses mensuelles par catégorie</h2></div></div>
      <CategorySpendingChart months={data.spendingAnalytics.months} series={spendingSeries}/>
    </section>
    <section className="card recent-card">
      <div className="card-heading"><div><p className="eyebrow">DERNIÈRES OPÉRATIONS</p><h2>Mouvements récents</h2></div><Link href="/transactions">Toutes les opérations <Icon name="chevron"/></Link></div>
      {data.transactions.slice(0, 5).map((transaction) => <div className="transaction-row" key={transaction.id}><div className="category-dot" style={{ background: `${transaction.category?.color ?? "#aaa"}20`, color: transaction.category?.color }}><Icon name={transaction.category?.icon ?? "help"}/></div><div className="transaction-main"><strong>{transaction.counterparty || transaction.description}</strong><span>{formatShortDate(transaction.booked_at)} · {transaction.category?.name ?? "À classer"}{transaction.status === "pending" ? <em>En attente</em> : null}</span></div><strong className={transaction.amount > 0 ? "amount positive" : "amount"}>{transaction.amount > 0 ? "+" : "−"}{formatCurrency(Math.abs(transaction.amount))}</strong></div>)}
    </section>
  </div>;
}
