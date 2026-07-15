"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { updateTransactionCategory } from "@/app/actions";
import { formatCurrency, formatShortDate } from "@/lib/budget";
import type { BankAccount, BudgetTransaction, Category } from "@/lib/types";
import { Icon } from "./icon";

export function TransactionList({ transactions, categories, accounts }: { transactions: BudgetTransaction[]; categories: Category[]; accounts: BankAccount[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [account, setAccount] = useState("all");
  const [status, setStatus] = useState("all");
  const deferredSearch = useDeferredValue(search.toLowerCase());
  const [, startTransition] = useTransition();
  const filtered = useMemo(() => transactions.filter((item) => {
    const matchesSearch = !deferredSearch || `${item.description} ${item.counterparty ?? ""}`.toLowerCase().includes(deferredSearch);
    return matchesSearch
      && (category === "all" || item.category_id === category)
      && (account === "all" || item.account_id === account)
      && (status === "all" || item.status === status);
  }), [transactions, deferredSearch, category, account, status]);

  return <>
    <div className="filters card">
      <label className="search-field"><span className="sr-only">Rechercher</span><input placeholder="Rechercher une opération…" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
      <select aria-label="Filtrer par compte" value={account} onChange={(event) => setAccount(event.target.value)}><option value="all">Tous les comptes</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.iban_masked ?? item.currency}</option>)}</select>
      <select aria-label="Filtrer par catégorie" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Toutes les catégories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label="Filtrer par statut" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tous les statuts</option><option value="booked">Comptabilisées</option><option value="pending">En attente</option></select>
    </div>
    <div className="transaction-table card">
      {filtered.length ? filtered.map((transaction) => <article className="transaction-row" key={transaction.id}>
        <div className="category-dot" style={{ background: `${transaction.category?.color ?? "#c0c5ce"}20`, color: transaction.category?.color }}><Icon name={transaction.category?.icon ?? "help"}/></div>
        <div className="transaction-main"><strong>{transaction.counterparty || transaction.description}</strong><span>{formatShortDate(transaction.booked_at)} · {transaction.account?.iban_masked ?? transaction.account?.name ?? "Compte"}{transaction.status === "pending" ? <em>En attente</em> : null}</span></div>
        <select className="category-select" aria-label={`Catégorie de ${transaction.description}`} value={transaction.category_id ?? ""} onChange={(event) => startTransition(() => updateTransactionCategory(transaction.id, event.target.value))}>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <strong className={transaction.amount >= 0 ? "amount positive" : "amount"}>{transaction.amount >= 0 ? "+" : "−"}{formatCurrency(Math.abs(transaction.amount))}</strong>
      </article>) : <div className="empty-state"><Icon name="list"/><h3>Aucune opération</h3><p>Modifiez vos filtres pour afficher d’autres résultats.</p></div>}
    </div>
  </>;
}
