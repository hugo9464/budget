import { describe, expect, it } from "vitest";
import { buildBankSyncStatus } from "./sync-status";

const base = {
  last_synced_at: "2026-07-16T10:00:00.000Z",
  balance_quota_remaining: 3,
  balance_quota_reset_at: "2026-07-17T00:00:00.000Z",
  transaction_quota_remaining: 2,
  transaction_quota_reset_at: "2026-07-17T00:00:00.000Z",
};

describe("statut de synchronisation bancaire", () => {
  it("affiche le minimum permettant une synchronisation complète", () => {
    const status = buildBankSyncStatus([
      base,
      { ...base, balance_quota_remaining: 1, transaction_quota_remaining: 4 },
    ], new Date("2026-07-16T12:00:00.000Z"));
    expect(status).toEqual({
      lastSyncedAt: "2026-07-16T10:00:00.000Z",
      quotaRemaining: 1,
      quotaResetAt: null,
    });
  });

  it("bloque jusqu'à la réinitialisation la plus tardive", () => {
    const status = buildBankSyncStatus([
      { ...base, balance_quota_remaining: 0, balance_quota_reset_at: "2026-07-17T00:30:00.000Z" },
      { ...base, transaction_quota_remaining: 0, transaction_quota_reset_at: "2026-07-17T01:00:00.000Z" },
    ], new Date("2026-07-16T12:00:00.000Z"));
    expect(status.quotaRemaining).toBe(0);
    expect(status.quotaResetAt).toBe("2026-07-17T01:00:00.000Z");
  });

  it("oublie un quota expiré pour autoriser une nouvelle mesure", () => {
    const status = buildBankSyncStatus([
      { ...base, balance_quota_remaining: 0, balance_quota_reset_at: "2026-07-16T11:00:00.000Z" },
    ], new Date("2026-07-16T12:00:00.000Z"));
    expect(status.quotaRemaining).toBeNull();
    expect(status.quotaResetAt).toBeNull();
  });
});
