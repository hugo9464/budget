-- Passkeys WebAuthn (Touch ID / Face ID) liées aux utilisateurs Supabase Auth.
create table public.passkeys (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_name text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index passkeys_user_idx on public.passkeys(user_id);

alter table public.passkeys enable row level security;
revoke all on public.passkeys from anon, authenticated;
grant all on public.passkeys to service_role;
