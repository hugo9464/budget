create extension if not exists pgcrypto;

create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null,
  institution_name text not null default 'BoursoBank',
  requisition_id text unique,
  agreement_id text,
  status text not null default 'created' check (status in ('created','linked','expired','rejected','error')),
  error_message text,
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.bank_connections(id) on delete cascade,
  external_id text not null unique,
  iban_masked text,
  name text not null default 'Compte BoursoBank',
  currency text not null default 'EUR',
  balance numeric(14,2) not null default 0,
  available_balance numeric(14,2),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  color text not null,
  icon text not null,
  kind text not null default 'expense' check (kind in ('expense','income','transfer','uncategorized')),
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.bank_accounts(id) on delete cascade,
  external_id text,
  fingerprint text not null,
  pending_fingerprint text,
  status text not null check (status in ('booked','pending')),
  booked_at date,
  value_at date,
  amount numeric(14,2) not null,
  currency text not null default 'EUR',
  counterparty text,
  description text not null,
  normalized_merchant text not null,
  category_id uuid references public.categories(id),
  category_source text not null default 'unclassified' check (category_source in ('manual','rule','heuristic','ai','unclassified')),
  category_confidence numeric(4,3),
  is_transfer boolean not null default false,
  manually_categorized boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, fingerprint)
);

create unique index transactions_external_id_unique
  on public.transactions(account_id, external_id) where external_id is not null;
create index transactions_booked_at_idx on public.transactions(booked_at desc);
create index transactions_category_idx on public.transactions(category_id);
create index transactions_merchant_idx on public.transactions(normalized_merchant);

create table public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  matcher text not null,
  match_type text not null default 'merchant' check (match_type in ('merchant','contains','regex')),
  category_id uuid not null references public.categories(id) on delete cascade,
  priority integer not null default 100,
  created_from_transaction uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(matcher, match_type)
);

create table public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category_id, month)
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.bank_connections(id) on delete set null,
  status text not null check (status in ('running','success','error')),
  trigger text not null default 'app_open' check (trigger in ('app_open','manual','callback')),
  imported_count integer not null default 0,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index one_running_sync on public.sync_runs((status)) where status = 'running';

create table public.login_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);
create index login_attempts_rate_idx on public.login_attempts(ip_hash, attempted_at desc);

insert into public.categories (slug, name, color, icon, kind, is_system, sort_order) values
  ('logement','Logement','#7357FF','home','expense',true,10),
  ('courses','Courses','#30B78D','basket','expense',true,20),
  ('restaurants','Restaurants','#FF8A54','utensils','expense',true,30),
  ('transport','Transport','#4B9FFF','car','expense',true,40),
  ('sante','Santé','#F05E78','heart','expense',true,50),
  ('abonnements','Abonnements','#9A6DFF','repeat','expense',true,60),
  ('loisirs','Loisirs','#EF63B8','sparkles','expense',true,70),
  ('shopping','Shopping','#FFB648','bag','expense',true,80),
  ('vacances','Vacances','#2BBAD5','plane','expense',true,90),
  ('impots-frais','Impôts & frais','#6C7485','landmark','expense',true,100),
  ('epargne','Épargne','#1AA277','piggy','expense',true,110),
  ('revenus','Revenus','#18A66C','wallet','income',true,120),
  ('transferts','Transferts','#8C93A1','arrows','transfer',true,130),
  ('autres','Autres','#79808D','dots','expense',true,140),
  ('a-classer','À classer','#C0C5CE','help','uncategorized',true,150)
on conflict (slug) do nothing;

alter table public.bank_connections enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.categorization_rules enable row level security;
alter table public.monthly_budgets enable row level security;
alter table public.sync_runs enable row level security;
alter table public.login_attempts enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
