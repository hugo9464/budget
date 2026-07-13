import { describe, expect, it } from "vitest";
import {
  buildBudgetLines,
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
});
