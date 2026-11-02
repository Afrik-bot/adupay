-- AduPay core schema.
-- Money rules: amounts are bigint minor units (XOF has none; EUR/USD/CAD in cents),
-- every amount carries a currency, balances are derived from ledger_entries only.

create type public.currency_code as enum ('XOF', 'EUR', 'USD', 'CAD');
create type public.app_role as enum ('admin', 'compliance', 'payee');
create type public.user_type as enum ('resident', 'diaspora');
create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.wallet_provider as enum ('orange_money', 'mtn_momo', 'moov_money', 'wave', 'bank');
create type public.group_frequency as enum ('weekly', 'biweekly', 'monthly');
create type public.payout_order as enum ('fixed', 'lottery', 'vote');
create type public.group_status as enum ('draft', 'active', 'completed', 'cancelled');
create type public.member_role as enum ('manager', 'member', 'sponsor');
create type public.cycle_status as enum ('open', 'collecting', 'paid_out', 'closed');
create type public.payment_status as enum ('pending', 'succeeded', 'failed');
create type public.payment_direction as enum ('collect', 'payout');
create type public.payee_category as enum ('school', 'clinic', 'pharmacy', 'utility', 'landlord');
create type public.payment_purpose as enum ('school', 'health', 'bills', 'rent', 'tontine');
create type public.directed_payment_status as enum ('initiated', 'paid', 'received', 'confirmed', 'failed');
create type public.ledger_owner_type as enum ('user', 'group', 'payee', 'system');
create type public.ledger_side as enum ('debit', 'credit');
create type public.risk_status as enum ('open', 'reviewing', 'closed', 'escalated');
create type public.risk_severity as enum ('low', 'medium', 'high');
create type public.notification_channel as enum ('in_app', 'sms', 'whatsapp', 'ussd');

-- ---------------------------------------------------------------- identity

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  user_type public.user_type,
  country_code char(2) not null default 'CI',
  city text,
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  kyc_tier smallint not null default 0 check (kyc_tier between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ID numbers are never stored in plain text: only a hash and the last 4 characters.
create table public.kyc_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tier_requested smallint not null check (tier_requested between 1 and 2),
  document_type text not null check (document_type in ('cni', 'passport', 'residence_permit', 'proof_of_address', 'selfie')),
  document_path text,
  id_number_hash text,
  id_number_last4 text check (id_number_last4 is null or length(id_number_last4) <= 4),
  status public.review_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create table public.linked_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.wallet_provider not null,
  account_masked text not null,
  account_ref_hash text not null,
  label text,
  is_default boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider, account_ref_hash)
);
create unique index linked_accounts_one_default on public.linked_accounts (user_id) where is_default;

-- ---------------------------------------------------------------- tontines

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 80),
  manager_id uuid not null references public.profiles (id),
  currency public.currency_code not null default 'XOF',
  contribution_amount bigint not null check (contribution_amount > 0),
  frequency public.group_frequency not null,
  start_date date not null,
  member_limit int not null check (member_limit between 2 and 100),
  payout_order public.payout_order not null default 'fixed',
  status public.group_status not null default 'draft',
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  role public.member_role not null default 'member',
  -- sponsors (diaspora) pay on behalf of a member and hold no payout position
  sponsored_member_id uuid references public.profiles (id),
  payout_position int check (payout_position > 0),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id),
  unique (group_id, payout_position)
);

create table public.group_rules (
  group_id uuid primary key references public.groups (id) on delete cascade,
  grace_days int not null default 2 check (grace_days between 0 and 30),
  late_penalty_amount bigint not null default 0 check (late_penalty_amount >= 0),
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  number int not null check (number > 0),
  due_date date not null,
  recipient_id uuid references public.profiles (id),
  status public.cycle_status not null default 'open',
  created_at timestamptz not null default now(),
  unique (group_id, number)
);

-- ---------------------------------------------------------------- payees

create table public.payees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category public.payee_category not null,
  city text not null,
  address text,
  rccm_number text,
  contact_phone text,
  owner_id uuid references public.profiles (id),
  kyb_status public.review_status not null default 'pending',
  payout_provider public.wallet_provider,
  payout_account_masked text,
  created_at timestamptz not null default now()
);
create index payees_directory on public.payees (city, category) where kyb_status = 'approved';

-- ---------------------------------------------------------------- ledger

create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  owner_type public.ledger_owner_type not null,
  owner_id uuid,
  currency public.currency_code not null,
  normal_side public.ledger_side not null,
  allow_negative boolean not null default false,
  created_at timestamptz not null default now(),
  check ((owner_type = 'system') = (owner_id is null))
);
create index ledger_accounts_owner on public.ledger_accounts (owner_type, owner_id);

create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  kind text not null,
  description text,
  payment_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.ledger_transactions (id),
  account_id uuid not null references public.ledger_accounts (id),
  side public.ledger_side not null,
  amount bigint not null check (amount > 0),
  currency public.currency_code not null,
  created_at timestamptz not null default now()
);
create index ledger_entries_account on public.ledger_entries (account_id);
create index ledger_entries_transaction on public.ledger_entries (transaction_id);

-- ---------------------------------------------------------------- payments

-- One row per request to a rail. idempotency_key makes retries safe.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  user_id uuid references public.profiles (id),
  direction public.payment_direction not null,
  provider text not null,
  provider_ref text unique,
  amount bigint not null check (amount > 0),
  currency public.currency_code not null,
  -- AduPay-side account credited by a collect or debited by a payout
  ledger_account_id uuid not null references public.ledger_accounts (id),
  status public.payment_status not null default 'pending',
  failure_code text,
  purpose_type text,
  purpose_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_open on public.payments (status, created_at) where status = 'pending';

alter table public.ledger_transactions
  add constraint ledger_transactions_payment_fk foreign key (payment_id) references public.payments (id);

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  member_id uuid not null references public.profiles (id),
  paid_by uuid not null references public.profiles (id),
  amount bigint not null check (amount > 0),
  currency public.currency_code not null,
  payment_id uuid references public.payments (id),
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now()
);
create unique index contributions_one_success on public.contributions (cycle_id, member_id) where status = 'succeeded';

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references public.cycles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id),
  amount bigint not null check (amount > 0),
  currency public.currency_code not null,
  payment_id uuid references public.payments (id),
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.directed_payments (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id),
  payee_id uuid references public.payees (id),
  group_id uuid references public.groups (id),
  purpose public.payment_purpose not null,
  beneficiary_name text not null,
  reference text,
  amount bigint not null check (amount > 0),
  currency public.currency_code not null default 'XOF',
  source_currency public.currency_code not null,
  source_amount bigint not null check (source_amount > 0),
  fee_amount bigint not null check (fee_amount >= 0),
  -- an exchange rate is not money; numeric keeps it exact
  fx_rate numeric(14, 6) not null check (fx_rate > 0),
  payment_id uuid references public.payments (id),
  status public.directed_payment_status not null default 'initiated',
  created_at timestamptz not null default now(),
  check ((purpose = 'tontine') = (group_id is not null)),
  check (purpose = 'tontine' or payee_id is not null)
);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  kind text not null default 'custom' check (kind in ('school', 'tabaski', 'rent', 'custom')),
  target_amount bigint not null check (target_amount > 0),
  currency public.currency_code not null default 'XOF',
  lock_until date,
  weekly_topup_amount bigint check (weekly_topup_amount is null or weekly_topup_amount > 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- compliance

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null check (purpose in ('credit_score_sharing', 'marketing')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.risk_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  severity public.risk_severity not null default 'medium',
  subject_user_id uuid references public.profiles (id),
  payment_id uuid references public.payments (id),
  details jsonb not null default '{}',
  status public.risk_status not null default 'open',
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel public.notification_channel not null default 'in_app',
  template text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_table text,
  target_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- invariants

create function public.forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'P0001';
end;
$$;

create trigger ledger_entries_append_only
  before update or delete on public.ledger_entries
  for each row execute function public.forbid_mutation();
create trigger ledger_entries_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function public.forbid_mutation();
create trigger ledger_transactions_append_only
  before update or delete on public.ledger_transactions
  for each row execute function public.forbid_mutation();
create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.forbid_mutation();

-- Entry currency must match its account.
create function public.check_entry_currency() returns trigger
language plpgsql as $$
begin
  if new.currency <> (select currency from public.ledger_accounts where id = new.account_id) then
    raise exception 'entry currency % does not match account currency', new.currency using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger ledger_entries_currency
  before insert on public.ledger_entries
  for each row execute function public.check_entry_currency();

-- Every transaction balances (debits = credits per currency), checked at commit
-- so the entries of one transaction can be inserted one by one.
create function public.check_transaction_balanced() returns trigger
language plpgsql as $$
declare
  v_bad record;
begin
  select currency, sum(case when side = 'debit' then amount else -amount end) as net
    into v_bad
    from public.ledger_entries
   where transaction_id = new.transaction_id
   group by currency
  having sum(case when side = 'debit' then amount else -amount end) <> 0
   limit 1;
  if found then
    raise exception 'ledger transaction % is unbalanced in % by %', new.transaction_id, v_bad.currency, v_bad.net
      using errcode = 'P0001';
  end if;
  return null;
end;
$$;
create constraint trigger ledger_entries_balanced
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.check_transaction_balanced();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

-- New auth user -> profile.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, full_name)
  values (new.id, new.phone, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
