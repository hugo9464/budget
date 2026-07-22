import { describe, expect, it } from "vitest";
import { isDashboardTransactionVisible, isExpenseAccountExcluded } from "./account-visibility";

describe("visibilité des comptes dans le budget", () => {
  it("exclut le compte dont l’IBAN masqué se termine par 4206", () => {
    expect(isExpenseAccountExcluded({ iban_masked: "FR76 •••• 4206" })).toBe(true);
    expect(isExpenseAccountExcluded({ iban_masked: "FR76 •••• 0259" })).toBe(false);
    expect(isExpenseAccountExcluded({ iban_masked: null })).toBe(false);
  });

  it("masque seulement les dépenses du compte exclu", () => {
    const excluded = new Set(["account-4206"]);
    expect(isDashboardTransactionVisible({ account_id: "account-4206", amount: -20, is_transfer: false }, excluded)).toBe(false);
    expect(isDashboardTransactionVisible({ account_id: "account-4206", amount: 100, is_transfer: false }, excluded)).toBe(true);
    expect(isDashboardTransactionVisible({ account_id: "account-4206", amount: -100, is_transfer: true }, excluded)).toBe(true);
    expect(isDashboardTransactionVisible({ account_id: "account-0259", amount: -20, is_transfer: false }, excluded)).toBe(true);
  });
});
