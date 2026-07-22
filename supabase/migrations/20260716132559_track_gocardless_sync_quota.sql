alter table public.bank_accounts
  add column balance_quota_remaining integer check (balance_quota_remaining >= 0),
  add column balance_quota_reset_at timestamptz,
  add column transaction_quota_remaining integer check (transaction_quota_remaining >= 0),
  add column transaction_quota_reset_at timestamptz;
