import type { BankAccount, BudgetTransaction } from "./types";

export const EXCLUDED_EXPENSE_ACCOUNT_SUFFIXES = ["4206"] as const;

export function isExpenseAccountExcluded(account: Pick<BankAccount, "iban_masked">): boolean {
  const digits = account.iban_masked?.replace(/\D/g, "") ?? "";
  return EXCLUDED_EXPENSE_ACCOUNT_SUFFIXES.some((suffix) => digits.endsWith(suffix));
}

export function isDashboardTransactionVisible(
  transaction: Pick<BudgetTransaction, "account_id" | "amount" | "is_transfer">,
  excludedAccountIds: ReadonlySet<string>,
): boolean {
  return transaction.amount >= 0 || transaction.is_transfer || !excludedAccountIds.has(transaction.account_id);
}
