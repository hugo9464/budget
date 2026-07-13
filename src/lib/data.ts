import "server-only";
import { buildBudgetLines, currentMonth, monthBounds } from "./budget";
import { demoDashboard } from "./demo";
import { isDemoMode } from "./env";
import { getSupabaseAdmin } from "./supabase/admin";
import type { BankAccount, BudgetTransaction, Category, DashboardData, MonthlyBudget } from "./types";

function numeric<T extends Record<string, unknown>>(value: T, fields: string[]): T {
  const copy: Record<string, unknown> = { ...value };
  for (const field of fields) {
    if (copy[field] !== null && copy[field] !== undefined) copy[field] = Number(copy[field]);
  }
  return copy as T;
}

export async function getDashboardData(month = currentMonth()): Promise<DashboardData> {
  if (isDemoMode()) return demoDashboard(month);
  const supabase = getSupabaseAdmin();
  const { start, end, previousStart, previousEnd } = monthBounds(month);

  const [accountsResult, categoriesResult, transactionsResult, previousResult, budgetsResult, connectionResult] =
    await Promise.all([
      supabase.from("bank_accounts").select("*").order("created_at"),
      supabase.from("categories").select("*").order("sort_order"),
      supabase
        .from("transactions")
        .select("*, category:categories(*), account:bank_accounts(name)")
        .gte("booked_at", start)
        .lt("booked_at", end)
        .order("booked_at", { ascending: false }),
      supabase
        .from("transactions")
        .select("amount,is_transfer,status")
        .gte("booked_at", previousStart)
        .lt("booked_at", previousEnd),
      supabase.from("monthly_budgets").select("*").eq("month", `${month}-01`),
      supabase.from("bank_connections").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

  const error = [accountsResult, categoriesResult, transactionsResult, previousResult, budgetsResult, connectionResult].find(
    (result) => result.error,
  )?.error;
  if (error) throw error;

  const accounts = (accountsResult.data ?? []).map((item) =>
    numeric(item as BankAccount & Record<string, unknown>, ["balance", "available_balance"]),
  ) as BankAccount[];
  const categories = (categoriesResult.data ?? []) as Category[];
  const transactions = (transactionsResult.data ?? []).map((item) =>
    numeric(item as BudgetTransaction & Record<string, unknown>, ["amount", "category_confidence"]),
  ) as BudgetTransaction[];
  const previous = (previousResult.data ?? []).map((item) => numeric(item, ["amount"]));
  const budgets = (budgetsResult.data ?? []).map((item) => numeric(item, ["amount"])) as MonthlyBudget[];
  const budgetLines = buildBudgetLines(categories, budgets, transactions);
  const booked = transactions.filter((item) => item.status === "booked" && !item.is_transfer);
  const income = booked.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const expenses = booked.filter((item) => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const previousExpenses = previous
    .filter((item) => item.status === "booked" && !item.is_transfer && Number(item.amount) < 0)
    .reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);
  const totalBudget = budgetLines.reduce((sum, line) => sum + line.budget, 0);
  const latestSync = accounts.map((account) => account.last_synced_at).filter(Boolean).sort().at(-1) ?? null;

  return {
    month,
    accounts,
    categories,
    transactions,
    budgetLines,
    balance: accounts.reduce((sum, account) => sum + Number(account.balance), 0),
    income,
    expenses,
    savings: income - expenses,
    totalBudget,
    remainingBudget: totalBudget - expenses,
    expenseDelta: previousExpenses ? ((expenses - previousExpenses) / previousExpenses) * 100 : null,
    lastSyncedAt: latestSync,
    connection: connectionResult.data,
    demo: false,
  };
}

export async function getAllCategories(): Promise<Category[]> {
  if (isDemoMode()) return demoDashboard().categories;
  const { data, error } = await getSupabaseAdmin().from("categories").select("*").order("sort_order");
  if (error) throw error;
  return data as Category[];
}

export async function getRecentTransactions(limit = 100): Promise<BudgetTransaction[]> {
  if (isDemoMode()) return demoDashboard().transactions;
  const { data, error } = await getSupabaseAdmin()
    .from("transactions")
    .select("*, category:categories(*), account:bank_accounts(name)")
    .order("booked_at", { ascending: false, nullsFirst: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((item) => numeric(item, ["amount", "category_confidence"])) as BudgetTransaction[];
}
