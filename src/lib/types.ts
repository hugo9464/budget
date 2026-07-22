export type CategoryKind = "expense" | "income" | "transfer" | "uncategorized";
export type TransactionStatus = "booked" | "pending";
export type CategorySource = "manual" | "rule" | "heuristic" | "ai" | "unclassified";

export interface Category {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: string;
  kind: CategoryKind;
  is_system: boolean;
  sort_order: number;
}

export interface BankAccount {
  id: string;
  external_id: string;
  name: string;
  iban_masked: string | null;
  currency: string;
  balance: number;
  available_balance: number | null;
  last_synced_at: string | null;
  balance_quota_remaining: number | null;
  balance_quota_reset_at: string | null;
  transaction_quota_remaining: number | null;
  transaction_quota_reset_at: string | null;
}

export interface BankSyncStatus {
  lastSyncedAt: string | null;
  quotaRemaining: number | null;
  quotaResetAt: string | null;
}

export interface BudgetTransaction {
  id: string;
  account_id: string;
  external_id: string | null;
  fingerprint: string;
  status: TransactionStatus;
  booked_at: string | null;
  value_at: string | null;
  amount: number;
  currency: string;
  counterparty: string | null;
  description: string;
  normalized_merchant: string;
  category_id: string | null;
  category_source: CategorySource;
  category_confidence: number | null;
  is_transfer: boolean;
  manually_categorized: boolean;
  category?: Category | null;
  account?: Pick<BankAccount, "id" | "name" | "iban_masked"> | null;
}

export interface MonthlyBudget {
  id: string;
  category_id: string;
  month: string;
  amount: number;
}

export interface BudgetLine {
  category: Category;
  budget: number;
  spent: number;
  remaining: number;
  progress: number;
}

export interface CategorySpendingTotal {
  category: Category;
  amount: number;
  transactions: BudgetTransaction[];
}

export interface CategoryMonthlyAverage {
  category: Category;
  amount: number;
  total: number;
}

export interface CategorySpendingSeries {
  category: Category;
  total: number;
  values: number[];
}

export interface SpendingAnalytics {
  periodStart: string | null;
  periodEnd: string | null;
  monthEquivalents: number;
  months: string[];
  averages: CategoryMonthlyAverage[];
  series: CategorySpendingSeries[];
}

export interface DashboardData {
  month: string;
  accounts: BankAccount[];
  categories: Category[];
  transactions: BudgetTransaction[];
  budgetLines: BudgetLine[];
  categorySpending: CategorySpendingTotal[];
  spendingAnalytics: SpendingAnalytics;
  balance: number;
  income: number;
  expenses: number;
  savings: number;
  totalBudget: number;
  remainingBudget: number;
  expenseDelta: number | null;
  lastSyncedAt: string | null;
  syncStatus: BankSyncStatus;
  connection: {
    id: string;
    status: string;
    institution_name: string;
    consent_expires_at: string | null;
    error_message: string | null;
  } | null;
  demo: boolean;
}

export interface GoCardlessTransaction {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount: { amount: string; currency: string };
  creditorName?: string;
  debtorName?: string;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  additionalInformation?: string;
}
