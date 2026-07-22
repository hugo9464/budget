import { createHash } from "node:crypto";
import type { BudgetLine, BudgetTransaction, Category, CategorySpendingTotal, GoCardlessTransaction, MonthlyBudget, SpendingAnalytics } from "./types";

export function normalizeMerchant(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(cb|carte|paiement|achat|facture|virement|prelevement|sepa|prlv)\b/g, " ")
    .replace(/\d{2,}/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function transactionDescription(transaction: GoCardlessTransaction): string {
  return [
    transaction.creditorName,
    transaction.debtorName,
    transaction.remittanceInformationUnstructured,
    ...(transaction.remittanceInformationUnstructuredArray ?? []),
    transaction.additionalInformation,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 512);
}

export function transactionFingerprint(
  accountId: string,
  transaction: GoCardlessTransaction,
  status: "booked" | "pending",
): string {
  const description = transactionDescription(transaction);
  const stable = [
    accountId,
    transaction.transactionId ?? transaction.internalTransactionId ?? "",
    transaction.bookingDate ?? transaction.valueDate ?? "",
    transaction.transactionAmount.amount,
    transaction.transactionAmount.currency,
    normalizeMerchant(description),
    status,
  ].join("|");
  return createHash("sha256").update(stable).digest("hex");
}

export function pendingMatchFingerprint(accountId: string, transaction: GoCardlessTransaction): string {
  const stable = [
    accountId,
    transaction.transactionAmount.amount,
    transaction.transactionAmount.currency,
    normalizeMerchant(transactionDescription(transaction)),
  ].join("|");
  return createHash("sha256").update(stable).digest("hex");
}

export function detectTransfers(transactions: BudgetTransaction[]): Set<string> {
  const transfers = new Set<string>();
  const booked = transactions.filter((item) => item.status === "booked" && !item.manually_categorized);
  for (let index = 0; index < booked.length; index += 1) {
    const left = booked[index];
    for (let otherIndex = index + 1; otherIndex < booked.length; otherIndex += 1) {
      const right = booked[otherIndex];
      if (left.account_id === right.account_id || Math.abs(left.amount + right.amount) > 0.001) continue;
      const leftDate = new Date(left.booked_at ?? left.value_at ?? 0).getTime();
      const rightDate = new Date(right.booked_at ?? right.value_at ?? 0).getTime();
      if (Math.abs(leftDate - rightDate) <= 2 * 86_400_000) {
        transfers.add(left.id);
        transfers.add(right.id);
        break;
      }
    }
  }
  return transfers;
}

export function buildBudgetLines(
  categories: Category[],
  budgets: MonthlyBudget[],
  transactions: BudgetTransaction[],
): BudgetLine[] {
  const budgetByCategory = new Map(budgets.map((budget) => [budget.category_id, Number(budget.amount)]));
  const spentByCategory = new Map<string, number>();
  for (const transaction of transactions) {
    if (
      transaction.status !== "booked" ||
      transaction.amount >= 0 ||
      transaction.is_transfer ||
      !transaction.category_id
    ) continue;
    spentByCategory.set(
      transaction.category_id,
      (spentByCategory.get(transaction.category_id) ?? 0) + Math.abs(transaction.amount),
    );
  }

  return categories
    .filter((category) => category.kind === "expense")
    .map((category) => {
      const budget = budgetByCategory.get(category.id) ?? 0;
      const spent = spentByCategory.get(category.id) ?? 0;
      return {
        category,
        budget,
        spent,
        remaining: budget - spent,
        progress: budget > 0 ? Math.min((spent / budget) * 100, 100) : 0,
      };
    })
    .sort((a, b) => b.spent - a.spent || a.category.sort_order - b.category.sort_order);
}

export function buildCategorySpending(
  categories: Category[],
  transactions: BudgetTransaction[],
): CategorySpendingTotal[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const unclassified = categories.find((category) => category.slug === "a-classer") ?? null;
  const totals = new Map<string, { amount: number; transactions: BudgetTransaction[] }>();

  for (const transaction of transactions) {
    if (transaction.status !== "booked" || transaction.amount >= 0 || transaction.is_transfer) continue;
    const assigned = transaction.category_id ? categoryById.get(transaction.category_id) : null;
    const category = assigned?.kind === "expense" || assigned?.kind === "uncategorized" ? assigned : unclassified;
    if (!category) continue;
    const current = totals.get(category.id) ?? { amount: 0, transactions: [] };
    current.amount += Math.abs(transaction.amount);
    current.transactions.push(transaction);
    totals.set(category.id, current);
  }

  return [...totals]
    .map(([categoryId, total]) => ({
      category: categoryById.get(categoryId)!,
      amount: total.amount,
      transactions: total.transactions.toSorted((left, right) =>
        (right.booked_at ?? right.value_at ?? "").localeCompare(left.booked_at ?? left.value_at ?? "")
        || right.id.localeCompare(left.id),
      ),
    }))
    .toSorted((left, right) => right.amount - left.amount || left.category.sort_order - right.category.sort_order);
}

export function buildSpendingAnalytics(
  categories: Category[],
  transactions: BudgetTransaction[],
): SpendingAnalytics {
  const expenses = transactions.filter((transaction) =>
    transaction.status === "booked"
    && transaction.amount < 0
    && !transaction.is_transfer
    && Boolean(transaction.booked_at),
  );
  if (!expenses.length) {
    return { periodStart: null, periodEnd: null, monthEquivalents: 0, months: [], averages: [], series: [] };
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const dates = expenses.map((transaction) => transaction.booked_at!).toSorted();
  const periodStart = dates[0];
  const periodEnd = dates.at(-1)!;
  const inclusiveDays = Math.round(
    (Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`)) / 86_400_000,
  ) + 1;
  const monthEquivalents = Math.max(1, inclusiveDays / 30);

  const months: string[] = [];
  const cursor = new Date(`${periodStart.slice(0, 7)}-01T00:00:00Z`);
  const lastMonth = periodEnd.slice(0, 7);
  while (cursor.toISOString().slice(0, 7) <= lastMonth) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const totals = new Map<string, number>();
  const monthlyTotals = new Map<string, Map<string, number>>();
  for (const transaction of expenses) {
    if (!transaction.category_id || !categoryById.has(transaction.category_id)) continue;
    const amount = Math.abs(transaction.amount);
    const month = transaction.booked_at!.slice(0, 7);
    totals.set(transaction.category_id, (totals.get(transaction.category_id) ?? 0) + amount);
    const categoryMonths = monthlyTotals.get(transaction.category_id) ?? new Map<string, number>();
    categoryMonths.set(month, (categoryMonths.get(month) ?? 0) + amount);
    monthlyTotals.set(transaction.category_id, categoryMonths);
  }

  const averages = [...totals]
    .map(([categoryId, total]) => ({ category: categoryById.get(categoryId)!, total, amount: total / monthEquivalents }))
    .toSorted((left, right) => right.amount - left.amount);
  const series = averages.map(({ category, total }) => ({
    category,
    total,
    values: months.map((month) => monthlyTotals.get(category.id)?.get(month) ?? 0),
  }));
  return { periodStart, periodEnd, monthEquivalents, months, averages, series };
}

export function monthBounds(month: string): { start: string; end: string; previousStart: string; previousEnd: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  const previousStart = new Date(Date.UTC(year, monthNumber - 2, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    previousStart: previousStart.toISOString().slice(0, 10),
    previousEnd: start.toISOString().slice(0, 10),
  };
}

export function currentMonth(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

export function formatShortDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", timeZone: "Europe/Paris" }).format(
    new Date(`${value}T12:00:00Z`),
  );
}
