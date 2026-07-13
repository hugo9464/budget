import { createHash } from "node:crypto";
import type { BudgetLine, BudgetTransaction, Category, GoCardlessTransaction, MonthlyBudget } from "./types";

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
