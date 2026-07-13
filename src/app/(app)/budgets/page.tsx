import type { Metadata } from "next";
import { saveBudget } from "@/app/actions";
import { formatCurrency } from "@/lib/budget";
import { getDashboardData } from "@/lib/data";
import { Icon } from "@/components/icon";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const data = await getDashboardData(month);
  return <div className="page"><header className="page-header"><div><p className="eyebrow">OBJECTIFS MENSUELS</p><h1>Budgets</h1><p className="muted">Chaque enveloppe repart à zéro au début du mois.</p></div><form className="month-picker"><input name="month" type="month" defaultValue={data.month}/><button>Afficher</button></form></header>
    <section className="budget-summary card"><div><p>Budget total</p><strong>{formatCurrency(data.totalBudget)}</strong></div><div><p>Dépensé</p><strong>{formatCurrency(data.expenses)}</strong></div><div><p>Disponible</p><strong className={data.remainingBudget < 0 ? "negative" : "positive"}>{formatCurrency(data.remainingBudget)}</strong></div></section>
    <section className="budget-list card"><div className="card-heading"><div><p className="eyebrow">PAR CATÉGORIE</p><h2>Vos enveloppes</h2></div></div>{data.budgetLines.map((line) => <article className="budget-row" key={line.category.id}>
      <div className="category-dot" style={{ background: `${line.category.color}20`, color: line.category.color }}><Icon name={line.category.icon}/></div>
      <div className="budget-row-main"><strong>{line.category.name}</strong><span>{formatCurrency(line.spent)} dépensés · {formatCurrency(line.remaining)} restants</span><div className="budget-progress"><span style={{ width: `${line.progress}%`, background: line.category.color }}/></div></div>
      <form action={saveBudget} className="budget-form"><input type="hidden" name="categoryId" value={line.category.id}/><input type="hidden" name="month" value={data.month}/><label><span className="sr-only">Budget {line.category.name}</span><input name="amount" type="number" min="0" step="10" defaultValue={line.budget}/><b>€</b></label><button className="secondary-button">Enregistrer</button></form>
    </article>)}</section>
  </div>;
}
