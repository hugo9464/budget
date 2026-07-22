import type { BankAccount, BankSyncStatus } from "./types";

type QuotaField = Pick<BankAccount,
  | "balance_quota_remaining"
  | "balance_quota_reset_at"
  | "transaction_quota_remaining"
  | "transaction_quota_reset_at"
  | "last_synced_at"
>;

export function buildBankSyncStatus(accounts: QuotaField[], now = new Date()): BankSyncStatus {
  const lastSyncedAt = accounts
    .map((account) => account.last_synced_at)
    .filter((value): value is string => Boolean(value))
    .toSorted()
    .at(-1) ?? null;

  const quotas = accounts.flatMap((account) => [
    { remaining: account.balance_quota_remaining, resetAt: account.balance_quota_reset_at },
    { remaining: account.transaction_quota_remaining, resetAt: account.transaction_quota_reset_at },
  ]).map((quota) => {
    if (quota.resetAt && new Date(quota.resetAt).getTime() <= now.getTime()) {
      return { remaining: null, resetAt: null };
    }
    return quota;
  });

  if (!quotas.length || quotas.some((quota) => quota.remaining === null)) {
    return { lastSyncedAt, quotaRemaining: null, quotaResetAt: null };
  }

  const quotaRemaining = Math.min(...quotas.map((quota) => quota.remaining!));
  const blockingResets = quotas
    .filter((quota) => quota.remaining === 0 && quota.resetAt)
    .map((quota) => quota.resetAt!)
    .toSorted();

  return {
    lastSyncedAt,
    quotaRemaining,
    quotaResetAt: quotaRemaining === 0 ? blockingResets.at(-1) ?? null : null,
  };
}
