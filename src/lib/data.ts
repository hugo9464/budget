import "server-only";
import { cache } from "react";
import { isDashboardTransactionVisible, isExpenseAccountExcluded } from "./account-visibility";
import { buildBudgetLines, buildCategorySpending, buildSpendingAnalytics, currentMonth, monthBounds } from "./budget";
import { demoDashboard } from "./demo";
import { isDemoMode } from "./env";
import { getSupabaseAdmin } from "./supabase/admin";
import { currentParisYearRange } from "./time";
import { buildBankSyncStatus } from "./sync-status";
import type { BankAccount, BankSyncStatus, BudgetTransaction, Category, DashboardData, MonthlyBudget } from "./types";

function numeric<T extends Record<string, unknown>>(value: T, fields: string[]): T {
  const copy: Record<string, unknown> = { ...value };
  for (const field of fields) {
    if (copy[field] !== null && copy[field] !== undefined) copy[field] = Number(copy[field]);
  }
  return copy as T;
}

async function getYearlyExpenseTransactions(
  accountIds: string[],
  dateFrom: string,
  dateTo: string,
): Promise<BudgetTransaction[]> {
  if (!accountIds.length) return [];
  const supabase = getSupabaseAdmin();
  const pageSize = 1000;
  const transactions: BudgetTransaction[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id,account_id,external_id,fingerprint,status,booked_at,value_at,amount,currency,counterparty,description,normalized_merchant,category_id,category_source,category_confidence,is_transfer,manually_categorized")
      .in("account_id", accountIds)
      .eq("status", "booked")
      .eq("is_transfer", false)
      .lt("amount", 0)
      .gte("booked_at", dateFrom)
      .lte("booked_at", dateTo)
      .order("booked_at")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []).map((item) =>
      numeric(item as BudgetTransaction & Record<string, unknown>, ["amount", "category_confidence"]),
    ) as BudgetTransaction[];
    transactions.push(...page);
    if (page.length < pageSize) break;
  }
  return transactions;
}

const getLinkedBankContext = cache(async () => {
  const supabase = getSupabaseAdmin();
  const { data: connections, error: connectionsError } = await supabase
    .from("bank_connections")
    .select("*")
    .eq("status", "linked")
    .order("created_at", { ascending: false });
  if (connectionsError) throw connectionsError;

  const connectionIds = (connections ?? []).map((connection) => connection.id);
  if (!connectionIds.length) return { connections: [], accounts: [] };
  const { data: accounts, error: accountsError } = await supabase
    .from("bank_accounts")
    .select("*")
    .in("connection_id", connectionIds)
    .order("created_at");
  if (accountsError) throw accountsError;
  return { connections: connections ?? [], accounts: accounts ?? [] };
});

function syncStatusWithExistingRateLimit(status: BankSyncStatus, connections: Array<{ error_message?: string | null }>): BankSyncStatus {
  if (status.quotaRemaining !== null) return status;
  const hasExistingRateLimit = connections.some((connection) =>
    /limite temporairement|quota bancaire épuisé/i.test(connection.error_message ?? ""),
  );
  return hasExistingRateLimit ? { ...status, quotaRemaining: 0 } : status;
}

export async function getDashboardData(month = currentMonth()): Promise<DashboardData> {
  if (isDemoMode()) return demoDashboard(month);
  const supabase = getSupabaseAdmin();
  const { start, end, previousStart, previousEnd } = monthBounds(month);
  const categoriesPromise = supabase.from("categories").select("*").order("sort_order");
  const budgetsPromise = supabase.from("monthly_budgets").select("*").eq("month", `${month}-01`);
  const { connections, accounts: accountRows } = await getLinkedBankContext();
  const accountIds = accountRows.map((account) => account.id);
  const excludedExpenseAccountIds = new Set(
    accountRows.filter(isExpenseAccountExcluded).map((account) => account.id),
  );
  const expenseAccountIds = accountIds.filter((accountId) => !excludedExpenseAccountIds.has(accountId));

  const transactionsPromise = accountIds.length
    ? supabase
      .from("transactions")
      .select("*, category:categories(*), account:bank_accounts(id,name,iban_masked)")
      .in("account_id", accountIds)
      .gte("booked_at", start)
      .lt("booked_at", end)
      .order("booked_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const previousPromise = accountIds.length
    ? supabase
      .from("transactions")
      .select("account_id,amount,is_transfer,status")
      .in("account_id", accountIds)
      .gte("booked_at", previousStart)
      .lt("booked_at", previousEnd)
    : Promise.resolve({ data: [], error: null });
  const { dateFrom, dateTo } = currentParisYearRange();
  const yearlyExpensesPromise = getYearlyExpenseTransactions(expenseAccountIds, dateFrom, dateTo);
  const [categoriesResult, budgetsResult, transactionsResult, previousResult, yearlyExpenses] = await Promise.all([
    categoriesPromise,
    budgetsPromise,
    transactionsPromise,
    previousPromise,
    yearlyExpensesPromise,
  ]);

  const error = [categoriesResult, transactionsResult, previousResult, budgetsResult].find(
    (result) => result.error,
  )?.error;
  if (error) throw error;

  const accounts = accountRows.map((item) =>
    numeric(item as BankAccount & Record<string, unknown>, ["balance", "available_balance", "balance_quota_remaining", "transaction_quota_remaining"]),
  ) as BankAccount[];
  const categories = (categoriesResult.data ?? []) as Category[];
  const transactions = (transactionsResult.data ?? []).map((item) =>
    numeric(item as BudgetTransaction & Record<string, unknown>, ["amount", "category_confidence"]),
  ) as BudgetTransaction[];
  const visibleTransactions = transactions.filter((transaction) =>
    isDashboardTransactionVisible(transaction, excludedExpenseAccountIds),
  );
  const previous = (previousResult.data ?? []).map((item) => numeric(item, ["amount"]));
  const budgets = (budgetsResult.data ?? []).map((item) => numeric(item, ["amount"])) as MonthlyBudget[];
  const budgetLines = buildBudgetLines(categories, budgets, visibleTransactions);
  const booked = visibleTransactions.filter((item) => item.status === "booked" && !item.is_transfer);
  const income = booked.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const expenses = booked.filter((item) => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const previousExpenses = previous
    .filter((item) => item.status === "booked"
      && !item.is_transfer
      && Number(item.amount) < 0
      && isDashboardTransactionVisible({
        account_id: String(item.account_id),
        amount: Number(item.amount),
        is_transfer: Boolean(item.is_transfer),
      }, excludedExpenseAccountIds))
    .reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);
  const totalBudget = budgetLines.reduce((sum, line) => sum + line.budget, 0);
  const latestSync = accounts.map((account) => account.last_synced_at).filter(Boolean).sort().at(-1) ?? null;

  return {
    month,
    accounts,
    categories,
    transactions: visibleTransactions,
    budgetLines,
    categorySpending: buildCategorySpending(categories, visibleTransactions),
    spendingAnalytics: buildSpendingAnalytics(categories, yearlyExpenses),
    balance: accounts.reduce((sum, account) => sum + Number(account.balance), 0),
    income,
    expenses,
    savings: income - expenses,
    totalBudget,
    remainingBudget: totalBudget - expenses,
    expenseDelta: previousExpenses ? ((expenses - previousExpenses) / previousExpenses) * 100 : null,
    lastSyncedAt: latestSync,
    syncStatus: syncStatusWithExistingRateLimit(buildBankSyncStatus(accounts), connections),
    connection: connections[0] ?? null,
    demo: false,
  };
}

export async function getAllCategories(): Promise<Category[]> {
  if (isDemoMode()) return demoDashboard().categories;
  const { data, error } = await getSupabaseAdmin().from("categories").select("*").order("sort_order");
  if (error) throw error;
  return data as Category[];
}

export async function getAllBankAccounts(): Promise<BankAccount[]> {
  if (isDemoMode()) return demoDashboard().accounts;
  const { accounts } = await getLinkedBankContext();
  return accounts.map((account) =>
    numeric(account as BankAccount & Record<string, unknown>, ["balance", "available_balance", "balance_quota_remaining", "transaction_quota_remaining"]),
  ) as BankAccount[];
}

export async function getBankSyncStatus(): Promise<BankSyncStatus> {
  if (isDemoMode()) return demoDashboard().syncStatus;
  const { accounts, connections } = await getLinkedBankContext();
  const normalized = accounts.map((account) =>
    numeric(account as BankAccount & Record<string, unknown>, ["balance_quota_remaining", "transaction_quota_remaining"]),
  ) as BankAccount[];
  return syncStatusWithExistingRateLimit(buildBankSyncStatus(normalized), connections);
}

export async function getRecentTransactions(limit?: number): Promise<BudgetTransaction[]> {
  const { dateFrom } = currentParisYearRange();
  if (isDemoMode()) {
    const transactions = demoDashboard().transactions.filter((item) => (item.booked_at ?? item.value_at ?? "") >= dateFrom);
    return limit ? transactions.slice(0, limit) : transactions;
  }
  const supabase = getSupabaseAdmin();
  const { accounts } = await getLinkedBankContext();
  const accountIds = accounts.map((account) => account.id);
  if (!accountIds.length) return [];
  const pageSize = 1000;
  const transactions: BudgetTransaction[] = [];
  for (let offset = 0; !limit || offset < limit; offset += pageSize) {
    const requested = limit ? Math.min(pageSize, limit - offset) : pageSize;
    const { data, error } = await supabase
      .from("transactions")
      .select("*, category:categories(*), account:bank_accounts(id,name,iban_masked)")
      .in("account_id", accountIds)
      .or(`booked_at.gte.${dateFrom},value_at.gte.${dateFrom}`)
      .order("booked_at", { ascending: false, nullsFirst: true })
      .order("id", { ascending: false })
      .range(offset, offset + requested - 1);
    if (error) throw error;
    const page = (data ?? []).map((item) => numeric(item, ["amount", "category_confidence"])) as BudgetTransaction[];
    transactions.push(...page);
    if (page.length < requested) break;
  }
  return transactions;
}
