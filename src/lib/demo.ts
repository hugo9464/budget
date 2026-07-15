import { buildBudgetLines, currentMonth } from "./budget";
import type { BankAccount, BudgetTransaction, Category, DashboardData, MonthlyBudget } from "./types";

export const demoCategories: Category[] = [
  ["logement", "Logement", "#7357FF", "home", "expense"],
  ["courses", "Courses", "#30B78D", "basket", "expense"],
  ["restaurants", "Restaurants", "#FF8A54", "utensils", "expense"],
  ["transport", "Transport", "#4B9FFF", "car", "expense"],
  ["sante", "Santé", "#F05E78", "heart", "expense"],
  ["abonnements", "Abonnements", "#9A6DFF", "repeat", "expense"],
  ["loisirs", "Loisirs", "#EF63B8", "sparkles", "expense"],
  ["shopping", "Shopping", "#FFB648", "bag", "expense"],
  ["vacances", "Vacances", "#2BBAD5", "plane", "expense"],
  ["impots-frais", "Impôts & frais", "#6C7485", "landmark", "expense"],
  ["epargne", "Épargne", "#1AA277", "piggy", "expense"],
  ["revenus", "Revenus", "#18A66C", "wallet", "income"],
  ["transferts", "Transferts", "#8C93A1", "arrows", "transfer"],
  ["autres", "Autres", "#79808D", "dots", "expense"],
  ["a-classer", "À classer", "#C0C5CE", "help", "uncategorized"],
].map(([slug, name, color, icon, kind], index) => ({
  id: `demo-${slug}`,
  slug,
  name,
  color,
  icon,
  kind: kind as Category["kind"],
  is_system: true,
  sort_order: index * 10,
}));

const account: BankAccount = {
  id: "demo-account",
  external_id: "sandbox",
  name: "Compte courant BoursoBank",
  iban_masked: "FR76 •••• 4821",
  currency: "EUR",
  balance: 3842.56,
  available_balance: 3714.36,
  last_synced_at: new Date().toISOString(),
};

function demoDate(day: number): string {
  const month = currentMonth();
  return `${month}-${String(day).padStart(2, "0")}`;
}

export const demoTransactions: BudgetTransaction[] = [
  ["Salaire ACME", 3100, "revenus", 2, "ACME SAS"],
  ["Prélèvement loyer", -980, "logement", 3, "Agence du centre"],
  ["CARREFOUR CITY", -86.42, "courses", 6, "Carrefour"],
  ["Navigo Liberté+", -42.8, "transport", 8, "Île-de-France Mobilités"],
  ["NETFLIX.COM", -19.99, "abonnements", 9, "Netflix"],
  ["Restaurant Bambino", -48.5, "restaurants", 10, "Bambino"],
  ["Pharmacie République", -23.7, "sante", 11, "Pharmacie République"],
  ["Monoprix", -54.25, "courses", 12, "Monoprix"],
  ["Billet SNCF Connect", -72, "vacances", 13, "SNCF Connect"],
  ["Paiement en attente", -32.4, "a-classer", 14, "Maison Kitsuné"],
].map(([description, amount, slug, day, counterparty], index) => {
  const category = demoCategories.find((item) => item.slug === slug)!;
  return {
    id: `demo-tx-${index}`,
    account_id: account.id,
    external_id: `demo-${index}`,
    fingerprint: `demo-${index}`,
    status: index === 9 ? "pending" : "booked",
    booked_at: demoDate(Number(day)),
    value_at: demoDate(Number(day)),
    amount: Number(amount),
    currency: "EUR",
    counterparty: String(counterparty),
    description: String(description),
    normalized_merchant: String(counterparty).toLowerCase(),
    category_id: category.id,
    category_source: index === 9 ? "unclassified" : "heuristic",
    category_confidence: index === 9 ? null : 0.95,
    is_transfer: false,
    manually_categorized: false,
    category,
    account: { id: account.id, name: account.name, iban_masked: account.iban_masked },
  };
});

export function demoDashboard(month = currentMonth()): DashboardData {
  const budgets: MonthlyBudget[] = [
    ["logement", 1100], ["courses", 450], ["restaurants", 180], ["transport", 120],
    ["sante", 80], ["abonnements", 60], ["loisirs", 150], ["shopping", 120], ["vacances", 200],
  ].map(([slug, amount]) => ({
    id: `demo-budget-${slug}`,
    category_id: demoCategories.find((item) => item.slug === slug)!.id,
    month: `${month}-01`,
    amount: Number(amount),
  }));
  const budgetLines = buildBudgetLines(demoCategories, budgets, demoTransactions);
  const booked = demoTransactions.filter((transaction) => transaction.status === "booked" && !transaction.is_transfer);
  const income = booked.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const expenses = booked.filter((item) => item.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const totalBudget = budgetLines.reduce((sum, line) => sum + line.budget, 0);
  return {
    month,
    accounts: [account],
    categories: demoCategories,
    transactions: demoTransactions,
    budgetLines,
    balance: account.balance,
    income,
    expenses,
    savings: income - expenses,
    totalBudget,
    remainingBudget: totalBudget - expenses,
    expenseDelta: -8.4,
    lastSyncedAt: account.last_synced_at,
    connection: {
      id: "demo-connection",
      status: "linked",
      institution_name: "BoursoBank · Démo",
      consent_expires_at: new Date(Date.now() + 62 * 86_400_000).toISOString(),
      error_message: null,
    },
    demo: true,
  };
}
