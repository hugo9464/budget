import { describe, expect, it } from "vitest";
import {
  buildBudgetLines,
  buildCategorySpending,
  buildSpendingAnalytics,
  detectTransfers,
  normalizeMerchant,
  pendingMatchFingerprint,
  transactionFingerprint,
} from "./budget";
import type { BudgetTransaction, Category, GoCardlessTransaction } from "./types";

const category: Category = { id: "groceries", slug: "courses", name: "Courses", color: "#000000", icon: "basket", kind: "expense", is_system: true, sort_order: 1 };

function transaction(overrides: Partial<BudgetTransaction>): BudgetTransaction {
  return {
    id: crypto.randomUUID(), account_id: "account-a", external_id: null, fingerprint: "x", status: "booked",
    booked_at: "2026-07-10", value_at: "2026-07-10", amount: -10, currency: "EUR", counterparty: null,
    description: "Test", normalized_merchant: "test", category_id: category.id, category_source: "heuristic",
    category_confidence: 1, is_transfer: false, manually_categorized: false, ...overrides,
  };
}

describe("normalisation et déduplication", () => {
  const source: GoCardlessTransaction = { transactionId: "tx-1", bookingDate: "2026-07-10", transactionAmount: { amount: "-12.50", currency: "EUR" }, creditorName: "CB 123456 CARREFOUR CITY" };
  it("nettoie le marchand sans conserver les numéros", () => expect(normalizeMerchant("CB 123456 CARREFOUR CITY")).toBe("carrefour city"));
  it("sépare pending et booked tout en conservant une empreinte de rapprochement", () => {
    expect(transactionFingerprint("account", source, "pending")).not.toBe(transactionFingerprint("account", source, "booked"));
    expect(pendingMatchFingerprint("account", source)).toBe(pendingMatchFingerprint("account", { ...source, bookingDate: "2026-07-11" }));
  });
});

describe("transferts et budgets", () => {
  it("détecte deux montants opposés sur deux comptes", () => {
    const left = transaction({ id: "left", account_id: "a", amount: -200 });
    const right = transaction({ id: "right", account_id: "b", amount: 200, booked_at: "2026-07-11" });
    expect([...detectTransfers([left, right])].sort()).toEqual(["left", "right"]);
  });
  it("ignore pending et transferts dans les dépenses budgétaires", () => {
    const lines = buildBudgetLines([category], [{ id: "budget", category_id: category.id, month: "2026-07-01", amount: 100 }], [
      transaction({ amount: -35 }), transaction({ amount: -20, status: "pending" }), transaction({ amount: -40, is_transfer: true }),
    ]);
    expect(lines[0]).toMatchObject({ budget: 100, spent: 35, remaining: 65, progress: 35 });
  });
  it("additionne les dépenses comptabilisées par catégorie", () => {
    const unclassified: Category = { ...category, id: "unknown", slug: "a-classer", name: "À classer", kind: "uncategorized", sort_order: 2 };
    const spending = buildCategorySpending([category, unclassified], [
      transaction({ amount: -35 }),
      transaction({ amount: -15, booked_at: "2026-07-11" }),
      transaction({ amount: -20, category_id: null }),
      transaction({ amount: -40, status: "pending" }),
      transaction({ amount: -50, is_transfer: true }),
    ]);
    expect(spending.map(({ category: itemCategory, amount, transactions }) => ({
      category: itemCategory,
      amount,
      transactionAmounts: transactions.map((item) => item.amount),
    }))).toEqual([
      { category, amount: 50, transactionAmounts: [-15, -35] },
      { category: unclassified, amount: 20, transactionAmounts: [-20] },
    ]);
  });
  it("calcule les moyennes mensuelles et les séries par catégorie", () => {
    const analytics = buildSpendingAnalytics([category], [
      transaction({ booked_at: "2026-04-17", amount: -300 }),
      transaction({ booked_at: "2026-05-10", amount: -600 }),
      transaction({ booked_at: "2026-07-15", amount: -900 }),
      transaction({ booked_at: "2026-06-10", amount: -500, is_transfer: true }),
    ]);
    expect(analytics).toMatchObject({
      periodStart: "2026-04-17",
      periodEnd: "2026-07-15",
      monthEquivalents: 3,
      months: ["2026-04", "2026-05", "2026-06", "2026-07"],
    });
    expect(analytics.averages[0]).toMatchObject({ amount: 600, total: 1800 });
    expect(analytics.series[0].values).toEqual([300, 600, 0, 900]);
  });
});
