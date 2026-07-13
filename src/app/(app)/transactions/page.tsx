import type { Metadata } from "next";
import { TransactionList } from "@/components/transaction-list";
import { getAllCategories, getRecentTransactions } from "@/lib/data";

export const metadata: Metadata = { title: "Opérations" };

export default async function TransactionsPage() {
  const [transactions, categories] = await Promise.all([getRecentTransactions(), getAllCategories()]);
  return <div className="page"><header className="page-header"><div><p className="eyebrow">HISTORIQUE</p><h1>Opérations</h1><p className="muted">Recherchez, filtrez et corrigez vos catégories.</p></div><span className="count-pill">{transactions.length} opérations</span></header><TransactionList transactions={transactions} categories={categories}/></div>;
}
