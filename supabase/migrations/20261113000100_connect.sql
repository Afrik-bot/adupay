-- Phase 15: AduPay Connect step 1. Airtime/data top-ups on Orange, MTN and Moov,
-- and "Data offerte" rewards for on-time tontine payments. Nothing real is bought:
-- deliveries go through AirtimeProvider (SandboxAirtimeProvider until a licensed
-- distributor is signed). Rules: docs/features/data-offerte.md.
--
-- Ledger (all XOF, integers):
--   wallet top-up     user wallet            -> provider_settlement   (when queued)
--   mobile money      rail -> user wallet (settle_payment), then the line above
--   card (EUR/...)    rail -> fx_clearing, FX via partner_settlement -> provider_settlement
--   reward            rewards_expense        -> provider_settlement   (when granted)
--   failed delivery   provider_settlement    -> buyer wallet (or back to rewards_expense)
-- provider_settlement is what AduPay owes the distributor; it is settled with the
-- partner outside the app.

create type public.airtime_operator as enum ('orange', 'mtn', 'moov');
create type public.airtime_product_type as enum ('airtime', 'data');
create type public.topup_source as enum ('wallet', 'card', 'reward');
create type public.topup_status as enum ('awaiting_payment', 'queued', 'sending', 'pending', 'succeeded', 'failed');
create type public.reward_trigger as enum ('on_time_contribution', 'clean_cycle', 'manager_member_on_time');

insert into public.ledger_accounts (code, owner_type, currency, normal_side, allow_negative)
values ('system:provider_settlement:XOF', 'system', 'XOF', 'credit', false),
       ('system:rewards_expense:XOF', 'system', 'XOF', 'debit', false);

-- ---------------------------------------------------------------- catalogue

create table public.airtime_products (
  id uuid primary key default gen_random_uuid(),
  provider_product_id text not null unique,
  operator public.airtime_operator not null,
  type public.airtime_product_type not null,
  label text not null,
  data_mb int check (data_mb is null or data_mb > 0),
  price_xof bigint not null check (price_xof > 0),
  validity_days int check (validity_days is null or validity_days > 0),
  active boolean not null default true,
  -- Sample prices until a distributor's real catalogue is loaded.
  sample boolean not null default true,
  updated_at timestamptz not null default now(),
  check ((type = 'data') = (data_mb is not null))
);

insert into public.airtime_products (provider_product_id, operator, type, label, data_mb, price_xof, validity_days)
select o.op || '-' || p.slug, o.op::public.airtime_operator, p.type::public.airtime_product_type, p.label,
       p.data_mb, p.price + o.delta, p.validity
  from (values ('orange', 0), ('mtn', 0), ('moov', -50)) as o(op, delta)
 cross join (values
   ('airtime-500', 'airtime', 'Crédit 500 FCFA', null::int, 500, null::int),
   ('airtime-1000', 'airtime', 'Crédit 1 000 FCFA', null, 1000, null),
   ('airtime-2000', 'airtime', 'Crédit 2 000 FCFA', null, 2000, null),
   ('airtime-5000', 'airtime', 'Crédit 5 000 FCFA', null, 5000, null),
   ('data-150', 'data', 'Pass 150 Mo · 1 jour', 150, 200, 1),
   ('data-500', 'data', 'Pass 500 Mo · 7 jours', 500, 500, 7),
   ('data-1500', 'data', 'Pass 1,5 Go · 30 jours', 1500, 2000, 30),
   ('data-5000', 'data', 'Pass 5 Go · 30 jours', 5000, 5000, 30)
 ) as p(slug, type, label, data_mb, price, validity);
-- Airtime keeps its face value on every network; only Moov's sample data is cheaper.
update public.airtime_products set price_xof = price_xof + 50 where type = 'airtime' and operator = 'moov';

-- Côte d'Ivoire 10-digit numbering: 01 Moov, 05 MTN, 07 Orange. Ported numbers keep
-- their prefix, so the user can always change the suggestion.
create function public.operator_for_msisdn(p_msisdn text) returns public.airtime_operator
language sql immutable as $$
  select case substr(regexp_replace(p_msisdn, '\D', '', 'g'), 4, 2)
           when '07' then 'orange'::public.airtime_operator
           when '05' then 'mtn'
           when '01' then 'moov'
         end
   where regexp_replace(p_msisdn, '\D', '', 'g') ~ '^225\d{10}$';
$$;

-- ---------------------------------------------------------------- favourites

create table public.saved_numbers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  msisdn text not null check (msisdn ~ '^225\d{10}$'),
  name text not null check (length(name) between 1 and 60),
  operator public.airtime_operator not null,
  created_at timestamptz not null default now(),
  unique (user_id, msisdn)
);

-- ---------------------------------------------------------------- rewards

create table public.reward_rules (
  trigger public.reward_trigger primary key,
  product_id uuid not null references public.airtime_products (id),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.reward_rules (trigger, product_id)
select t.trigger::public.reward_trigger, p.id
  from (values ('on_time_contribution', 'orange-data-500'), ('clean_cycle', 'orange-data-500'),
               ('manager_member_on_time', 'orange-data-150')) as t(trigger, product)
  join public.airtime_products p on p.provider_product_id = t.product;

-- One row: the per-user monthly cap and the budget a new month starts with.
create table public.reward_settings (
  id boolean primary key default true check (id),
  per_user_monthly_cap_xof bigint not null check (per_user_monthly_cap_xof >= 0),
  default_monthly_budget_xof bigint not null check (default_monthly_budget_xof >= 0),
  updated_at timestamptz not null default now()
);
insert into public.reward_settings (per_user_monthly_cap_xof, default_monthly_budget_xof) values (2000, 250000);

create table public.reward_budgets (
  month date primary key check (extract(day from month) = 1),
  budget_xof bigint not null check (budget_xof >= 0),
  spent_xof bigint not null default 0 check (spent_xof >= 0)
);

create table public.reward_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  rule_id public.reward_trigger not null references public.reward_rules (trigger),
  source_event_id text not null,
  group_id uuid references public.groups (id),
  product_id uuid not null references public.airtime_products (id),
  cost_xof bigint not null check (cost_xof >= 0),
  status text not null check (status in ('granted', 'delivered', 'failed', 'skipped')),
  skip_reason text check (skip_reason in ('user_cap', 'budget', 'no_number', 'rule_off', 'no_product')),
  topup_id uuid,
  month date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now(),
  -- a reward can only be granted once per event
  unique (rule_id, source_event_id)
);
create index reward_grants_user_month on public.reward_grants (user_id, month);

-- ---------------------------------------------------------------- top-ups

create table public.topups (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id),
  beneficiary_msisdn text not null check (beneficiary_msisdn ~ '^225\d{10}$'),
  beneficiary_name text,
  operator public.airtime_operator not null,
  product_id uuid not null references public.airtime_products (id),
  amount_xof bigint not null check (amount_xof > 0),
  source public.topup_source not null,
  status public.topup_status not null,
  idempotency_key text not null unique,
  -- what the card was charged (source = card): currency, amount in minor units, FX rate
  source_currency public.currency_code not null default 'XOF',
  source_amount bigint not null check (source_amount > 0),
  fx_rate numeric(14, 6),
  payment_id uuid references public.payments (id),
  grant_id uuid references public.reward_grants (id),
  provider_ref text unique,
  attempts int not null default 0,
  claimed_at timestamptz,
  failure_code text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'reward') = (grant_id is not null))
);
alter table public.reward_grants add constraint reward_grants_topup_fk foreign key (topup_id) references public.topups (id);
create index topups_buyer on public.topups (buyer_id, created_at desc);
create index topups_queue on public.topups (created_at) where status in ('queued', 'sending');
create trigger topups_touch before update on public.topups for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS

alter table public.airtime_products enable row level security;
alter table public.saved_numbers enable row level security;
alter table public.reward_rules enable row level security;
alter table public.reward_settings enable row level security;
alter table public.reward_budgets enable row level security;
alter table public.reward_grants enable row level security;
alter table public.topups enable row level security;
revoke all on public.airtime_products, public.saved_numbers, public.reward_rules, public.reward_settings,
  public.reward_budgets, public.reward_grants, public.topups from anon, authenticated;

grant select on public.airtime_products, public.reward_rules, public.reward_grants, public.topups to authenticated;
grant select, delete on public.saved_numbers to authenticated;
grant insert (user_id, msisdn, name, operator) on public.saved_numbers to authenticated;
grant select on public.reward_settings, public.reward_budgets to authenticated;

create policy products_select on public.airtime_products for select to authenticated using (active or public.is_staff());
create policy saved_select on public.saved_numbers for select to authenticated using (user_id = auth.uid());
create policy saved_insert on public.saved_numbers for insert to authenticated with check (user_id = auth.uid());
create policy saved_delete on public.saved_numbers for delete to authenticated using (user_id = auth.uid());
create policy rules_select on public.reward_rules for select to authenticated using (true);
create policy settings_select on public.reward_settings for select to authenticated using (public.is_staff());
create policy budgets_select on public.reward_budgets for select to authenticated using (public.is_staff());
create policy grants_select on public.reward_grants for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy topups_select on public.topups for select to authenticated using (buyer_id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------- KYC limits count wallet top-ups

-- Money a user pays in today: collects (as before) plus top-ups paid from their
-- AduPay balance, which never become a collect.
create or replace function public.daily_usage_xof(p_user_id uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select (
    select coalesce(sum(public.xof_equivalent(amount, currency)), 0)
      from public.payments
     where user_id = p_user_id and direction = 'collect' and status <> 'failed'
       and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
  ) + (
    select coalesce(sum(amount_xof), 0)
      from public.topups
     where buyer_id = p_user_id and source = 'wallet' and payment_id is null and status not in ('failed', 'awaiting_payment')
       and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
  );
$$;

-- ---------------------------------------------------------------- buying a top-up

/**
 * Records a top-up (server only). p_pay_with:
 *   'balance'      the AduPay balance is debited now and the top-up is queued;
 *   'mobile_money' / 'card'  it waits for the collect the server starts next.
 * Same p_idempotency_key -> the same top-up, so a retry never buys twice.
 */
create function public.create_topup(
  p_buyer_id uuid, p_msisdn text, p_beneficiary_name text, p_operator public.airtime_operator,
  p_product_id uuid, p_pay_with text, p_currency public.currency_code, p_idempotency_key text
) returns public.topups
language plpgsql security definer set search_path = public as $$
declare
  v_row public.topups;
  v_product public.airtime_products;
  v_msisdn text := regexp_replace(coalesce(p_msisdn, ''), '\D', '', 'g');
  v_tier smallint;
  v_limit bigint;
  v_wallet uuid;
  v_quote record;
  -- Top-ups carry no AduPay fee (0 FCFA); a card pays the converted price at the customer rate.
  v_source_amount bigint;
  v_rate numeric;
begin
  select * into v_row from public.topups where idempotency_key = p_idempotency_key;
  if found then
    return v_row;
  end if;
  if v_msisdn !~ '^225\d{10}$' then
    raise exception 'invalid_number' using errcode = '22023';
  end if;
  select * into v_product from public.airtime_products where id = p_product_id and active;
  if not found or v_product.operator <> p_operator then
    raise exception 'unknown_product' using errcode = '22023';
  end if;
  if p_pay_with not in ('balance', 'mobile_money', 'card') or (p_pay_with = 'card') <> (p_currency <> 'XOF') then
    raise exception 'invalid payment method' using errcode = '22023';
  end if;

  -- KYC tier limits, as for every payment (mobile money and card are also checked by create_payment).
  select kyc_tier into v_tier from public.profiles where id = p_buyer_id for update;
  v_limit := public.kyc_daily_limit_xof(v_tier);
  if v_limit = 0 then
    raise exception 'kyc_tier_0: identity verification is required before making payments' using errcode = 'P0003';
  end if;
  if public.daily_usage_xof(p_buyer_id) + v_product.price_xof > v_limit then
    raise exception 'kyc_daily_limit' using errcode = 'P0003';
  end if;

  v_source_amount := v_product.price_xof;
  if p_pay_with = 'card' then
    select * into v_quote from public.fx_quote(v_product.price_xof, p_currency);
    v_source_amount := v_quote.base_amount;
    v_rate := v_quote.customer_rate;
  end if;

  insert into public.topups (buyer_id, beneficiary_msisdn, beneficiary_name, operator, product_id, amount_xof,
                             source, status, idempotency_key, source_currency, source_amount, fx_rate)
  values (p_buyer_id, v_msisdn, nullif(trim(coalesce(p_beneficiary_name, '')), ''), p_operator, v_product.id,
          v_product.price_xof, case when p_pay_with = 'card' then 'card' else 'wallet' end::public.topup_source,
          case when p_pay_with = 'balance' then 'queued' else 'awaiting_payment' end::public.topup_status,
          p_idempotency_key, p_currency, v_source_amount, v_rate)
  returning * into v_row;

  if p_pay_with = 'balance' then
    v_wallet := public.ensure_ledger_account('user', p_buyer_id, 'XOF');
    if public.account_balance(v_wallet) < v_product.price_xof then
      raise exception 'insufficient_balance' using errcode = 'P0001';
    end if;
    perform public.post_ledger_transaction('topup:' || v_row.id, 'topup',
      jsonb_build_array(
        jsonb_build_object('account_id', v_wallet, 'side', 'debit', 'amount', v_product.price_xof),
        jsonb_build_object('account_id', public.system_account('provider_settlement', 'XOF'), 'side', 'credit', 'amount', v_product.price_xof)),
      'Recharge ' || v_product.label);
  end if;
  return v_row;
end;
$$;

-- When the collect for a top-up settles: pay the distributor and queue the delivery.
create function public.sync_topup_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_topup public.topups;
begin
  if new.purpose_type <> 'topup' or new.purpose_id is null or new.status = 'pending' then
    return null;
  end if;
  select * into v_topup from public.topups where id = new.purpose_id for update;
  if not found or v_topup.status <> 'awaiting_payment' then
    return null;
  end if;
  if new.status = 'failed' then
    update public.topups set status = 'failed', payment_id = new.id, failure_code = coalesce(new.failure_code, 'payment_failed')
     where id = v_topup.id;
    return null;
  end if;

  if new.currency = 'XOF' then
    -- Mobile money landed in the buyer's AduPay wallet (settle_payment); spend it.
    perform public.post_ledger_transaction('topup:' || v_topup.id, 'topup',
      jsonb_build_array(
        jsonb_build_object('account_id', new.ledger_account_id, 'side', 'debit', 'amount', v_topup.amount_xof),
        jsonb_build_object('account_id', public.system_account('provider_settlement', 'XOF'), 'side', 'credit', 'amount', v_topup.amount_xof)),
      'Recharge', new.id);
  else
    -- Card money is in fx_clearing: the partner sells it and buys the FCFA price.
    perform public.post_ledger_transaction('topup-fx:' || v_topup.id, 'topup_fx',
      jsonb_build_array(
        jsonb_build_object('account_id', public.system_account('fx_clearing', new.currency), 'side', 'debit', 'amount', new.amount),
        jsonb_build_object('account_id', public.system_account('partner_settlement', new.currency), 'side', 'credit', 'amount', new.amount),
        jsonb_build_object('account_id', public.system_account('partner_settlement', 'XOF'), 'side', 'debit', 'amount', v_topup.amount_xof),
        jsonb_build_object('account_id', public.system_account('provider_settlement', 'XOF'), 'side', 'credit', 'amount', v_topup.amount_xof)),
      'Recharge par carte', new.id);
  end if;
  update public.topups set status = 'queued', payment_id = new.id where id = v_topup.id;
  return null;
end;
$$;
create trigger payments_sync_topup after update of status on public.payments
  for each row execute function public.sync_topup_payment();

-- ---------------------------------------------------------------- delivery queue

/** Hands queued top-ups to one dispatcher (SKIP LOCKED); a stuck claim is retried after 10 min. */
create function public.claim_topups(p_limit int default 25)
returns table (id uuid, beneficiary_msisdn text, operator public.airtime_operator, provider_product_id text,
               idempotency_key text, attempts int)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select t.id from public.topups t
     where (t.status = 'queued' and (t.claimed_at is null or t.claimed_at < now() - t.attempts * interval '2 minutes'))
        or (t.status = 'sending' and t.claimed_at < now() - interval '10 minutes')
     order by t.created_at
     limit greatest(1, least(p_limit, 100))
     for update skip locked
  ), claimed as (
    update public.topups t set status = 'sending', claimed_at = now(), attempts = t.attempts + 1
      from picked where t.id = picked.id
    returning t.id, t.beneficiary_msisdn, t.operator, t.product_id, t.idempotency_key, t.attempts
  )
  select c.id, c.beneficiary_msisdn, c.operator, p.provider_product_id,
         -- one key per attempt: a retry only follows a definite failure, so it can never double-deliver
         c.idempotency_key || ':' || c.attempts, c.attempts
    from claimed c join public.airtime_products p on p.id = c.product_id;
end;
$$;

/** The distributor accepted (pending) or answered at once. */
create function public.mark_topup_sent(p_topup_id uuid, p_provider_ref text, p_status public.payment_status, p_failure_code text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.topups set provider_ref = p_provider_ref, status = 'pending'
   where id = p_topup_id and status = 'sending';
  if p_status <> 'pending' then
    perform public.complete_topup(p_provider_ref, p_status, p_failure_code);
  end if;
end;
$$;

/**
 * Final answer for a delivery (webhook or immediate). Failure: retry up to 3
 * attempts, then refund (buyer wallet, or back to the rewards budget).
 */
create function public.complete_topup(p_provider_ref text, p_status public.payment_status, p_failure_code text default null)
returns public.topups
language plpgsql security definer set search_path = public as $$
declare
  v_t public.topups;
  v_product public.airtime_products;
  v_grant public.reward_grants;
begin
  select * into v_t from public.topups where provider_ref = p_provider_ref for update;
  if not found then
    raise exception 'unknown top-up reference' using errcode = '22023';
  end if;
  if v_t.status not in ('pending', 'sending') or p_status = 'pending' then
    return v_t; -- already final (webhook replay) or still waiting
  end if;
  select * into v_product from public.airtime_products where id = v_t.product_id;

  if p_status = 'succeeded' then
    update public.topups set status = 'succeeded', delivered_at = now(), failure_code = null where id = v_t.id returning * into v_t;
    if v_t.source = 'reward' then
      select * into v_grant from public.reward_grants where id = v_t.grant_id;
      update public.reward_grants set status = 'delivered' where id = v_t.grant_id;
      insert into public.notifications (user_id, channel, template, payload, dedupe_key)
      values (v_t.buyer_id, 'whatsapp', 'reward_' || v_grant.rule_id,
              jsonb_build_object('data_mb', v_product.data_mb, 'group_id', v_grant.group_id,
                                 'group_name', (select name from public.groups where id = v_grant.group_id)),
              'reward:' || v_grant.id)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    else
      insert into public.notifications (user_id, channel, template, payload, dedupe_key)
      values (v_t.buyer_id, 'in_app', 'topup_delivered',
              jsonb_build_object('product', v_product.label, 'beneficiary_name', coalesce(v_t.beneficiary_name, '+' || v_t.beneficiary_msisdn)),
              'topup:' || v_t.id)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;
    return v_t;
  end if;

  -- failed
  if v_t.attempts < 3 then
    update public.topups set status = 'queued', failure_code = p_failure_code, provider_ref = null
     where id = v_t.id returning * into v_t;
    return v_t;
  end if;
  update public.topups set status = 'failed', failure_code = p_failure_code where id = v_t.id returning * into v_t;
  if v_t.source = 'reward' then
    perform public.post_ledger_transaction('reward-refund:' || v_t.grant_id, 'reward_refund',
      jsonb_build_array(
        jsonb_build_object('account_id', public.system_account('provider_settlement', 'XOF'), 'side', 'debit', 'amount', v_t.amount_xof),
        jsonb_build_object('account_id', public.system_account('rewards_expense', 'XOF'), 'side', 'credit', 'amount', v_t.amount_xof)),
      'Récompense non livrée');
    select * into v_grant from public.reward_grants where id = v_t.grant_id;
    update public.reward_grants set status = 'failed' where id = v_grant.id;
    update public.reward_budgets set spent_xof = greatest(0, spent_xof - v_grant.cost_xof) where month = v_grant.month;
  else
    -- Paid but not delivered: the money goes back to the buyer's AduPay balance.
    perform public.post_ledger_transaction('topup-refund:' || v_t.id, 'topup_refund',
      jsonb_build_array(
        jsonb_build_object('account_id', public.system_account('provider_settlement', 'XOF'), 'side', 'debit', 'amount', v_t.amount_xof),
        jsonb_build_object('account_id', public.ensure_ledger_account('user', v_t.buyer_id, 'XOF'), 'side', 'credit', 'amount', v_t.amount_xof)),
      'Remboursement recharge');
    insert into public.notifications (user_id, channel, template, payload, dedupe_key)
    values (v_t.buyer_id, 'in_app', 'topup_failed',
            jsonb_build_object('product', v_product.label, 'amount', v_t.amount_xof, 'currency', 'XOF'),
            'topup-failed:' || v_t.id)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return v_t;
end;
$$;

-- ---------------------------------------------------------------- granting rewards

/**
 * Grants one reward (inside the caller's transaction). Records a 'skipped' grant
 * with the reason when the rule is off, the member has no number, or the monthly
 * cap or budget would be passed, so every decision is logged exactly once.
 */
create function public.grant_reward(p_rule public.reward_trigger, p_user_id uuid, p_source_event_id text, p_group_id uuid)
returns public.reward_grants
language plpgsql security definer set search_path = public as $$
declare
  v_rule public.reward_rules;
  v_settings public.reward_settings;
  v_profile public.profiles;
  v_product public.airtime_products;
  v_operator public.airtime_operator;
  v_month date := date_trunc('month', now())::date;
  v_budget public.reward_budgets;
  v_user_spent bigint;
  v_grant public.reward_grants;
  v_reason text;
  v_topup uuid;
  v_same public.airtime_products;
begin
  select * into v_grant from public.reward_grants where rule_id = p_rule and source_event_id = p_source_event_id;
  if found then
    return v_grant; -- a retried job never grants twice
  end if;
  select * into v_rule from public.reward_rules where trigger = p_rule;
  select * into v_settings from public.reward_settings;
  select * into v_profile from public.profiles where id = p_user_id;
  v_operator := public.operator_for_msisdn(v_profile.phone);
  -- The rule's bundle, on the member's own network when that network sells the same volume.
  select * into v_product from public.airtime_products where id = v_rule.product_id;
  select * into v_same from public.airtime_products p
   where p.operator = v_operator and p.type = 'data' and p.data_mb = v_product.data_mb and p.active
   order by p.price_xof limit 1;
  if found then
    v_product := v_same;
  end if;

  insert into public.reward_budgets (month, budget_xof) values (v_month, v_settings.default_monthly_budget_xof)
  on conflict (month) do nothing;
  select * into v_budget from public.reward_budgets where month = v_month for update;
  select coalesce(sum(cost_xof), 0) into v_user_spent from public.reward_grants
   where user_id = p_user_id and month = v_month and status in ('granted', 'delivered');

  v_reason := case
    when v_rule.trigger is null or not v_rule.active then 'rule_off'
    when v_product.id is null or not v_product.active then 'no_product'
    when v_operator is null then 'no_number'
    when v_user_spent + v_product.price_xof > v_settings.per_user_monthly_cap_xof then 'user_cap'
    when v_budget.spent_xof + v_product.price_xof > v_budget.budget_xof then 'budget'
  end;

  insert into public.reward_grants (user_id, rule_id, source_event_id, group_id, product_id, cost_xof, status, skip_reason, month)
  values (p_user_id, p_rule, p_source_event_id, p_group_id, coalesce(v_product.id, v_rule.product_id),
          case when v_reason is null then v_product.price_xof else 0 end,
          case when v_reason is null then 'granted' else 'skipped' end, v_reason, v_month)
  on conflict (rule_id, source_event_id) do nothing
  returning * into v_grant;
  if v_grant.id is null or v_reason is not null then
    return v_grant;
  end if;

  update public.reward_budgets set spent_xof = spent_xof + v_product.price_xof where month = v_month;
  perform public.post_ledger_transaction('reward:' || v_grant.id, 'reward',
    jsonb_build_array(
      jsonb_build_object('account_id', public.system_account('rewards_expense', 'XOF'), 'side', 'debit', 'amount', v_product.price_xof),
      jsonb_build_object('account_id', public.system_account('provider_settlement', 'XOF'), 'side', 'credit', 'amount', v_product.price_xof)),
    'Data offerte');
  insert into public.topups (buyer_id, beneficiary_msisdn, operator, product_id, amount_xof, source, status,
                             idempotency_key, source_amount, grant_id)
  values (p_user_id, regexp_replace(v_profile.phone, '\D', '', 'g'), v_operator, v_product.id, v_product.price_xof,
          'reward', 'queued', 'reward:' || v_grant.id, v_product.price_xof, v_grant.id)
  returning id into v_topup;
  update public.reward_grants set topup_id = v_topup where id = v_grant.id returning * into v_grant;

  -- Risk: rewards claimed by an account opened the same day as the tontine.
  if v_profile.created_at::date = (select created_at::date from public.groups where id = p_group_id)
     and not exists (select 1 from public.risk_events where kind = 'reward_new_account' and subject_user_id = p_user_id
                       and details->>'group_id' = p_group_id::text) then
    perform public.raise_risk_event('reward_new_account', 'medium', null, p_user_id,
      jsonb_build_object('group_id', p_group_id, 'rule', p_rule));
  end if;
  return v_grant;
end;
$$;

-- When a contribution is paid: was it on or before the due date?
alter table public.contributions add column paid_at timestamptz;

create function public.stamp_contribution_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'succeeded' and new.paid_at is null then
    new.paid_at := now();
  end if;
  return new;
end;
$$;
create trigger contributions_paid_at before insert or update of status on public.contributions
  for each row execute function public.stamp_contribution_paid();
-- Shares paid before this migration: the best known time is when they were recorded.
update public.contributions set paid_at = created_at where status = 'succeeded' and paid_at is null;

create function public.reward_contribution() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cycle public.cycles;
  v_group public.groups;
begin
  if new.status <> 'succeeded' or (tg_op = 'UPDATE' and old.status = 'succeeded') then
    return new;
  end if;
  select * into v_cycle from public.cycles where id = new.cycle_id;
  -- Late contributions earn nothing (Abidjan is UTC).
  if (now() at time zone 'UTC')::date > v_cycle.due_date then
    return new;
  end if;
  select * into v_group from public.groups where id = v_cycle.group_id;
  perform public.grant_reward('on_time_contribution', new.member_id, 'contribution:' || new.id, v_group.id);
  if new.member_id <> v_group.manager_id then
    perform public.grant_reward('manager_member_on_time', v_group.manager_id, 'manager:' || new.id, v_group.id);
  end if;
  return new;
end;
$$;
create trigger contributions_reward after insert or update of status on public.contributions
  for each row execute function public.reward_contribution();

-- When a round is paid out with every member on time: everyone gets the clean-cycle reward.
create function public.reward_clean_cycle() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_on_time int;
  v_member record;
begin
  if new.status <> 'paid_out' or old.status = 'paid_out' then
    return new;
  end if;
  select count(distinct k.member_id) into v_on_time from public.contributions k
   where k.cycle_id = new.id and k.status = 'succeeded' and (k.paid_at at time zone 'UTC')::date <= new.due_date;
  if v_on_time < public.group_rotation_size(new.group_id) then
    return new;
  end if;
  for v_member in
    select user_id from public.group_members where group_id = new.group_id and role <> 'sponsor'
  loop
    perform public.grant_reward('clean_cycle', v_member.user_id, 'cycle:' || new.id || ':' || v_member.user_id, new.group_id);
  end loop;
  return new;
end;
$$;
create trigger cycles_reward_clean after update of status on public.cycles
  for each row execute function public.reward_clean_cycle();

-- ---------------------------------------------------------------- risk rules

create function public.topup_risk_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_numbers int;
  v_failed int;
begin
  if new.source = 'reward' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    select count(distinct beneficiary_msisdn) into v_numbers from public.topups
     where buyer_id = new.buyer_id and source <> 'reward' and created_at > now() - interval '24 hours';
    if v_numbers > 10 and not exists (select 1 from public.risk_events where kind = 'topup_many_numbers'
         and subject_user_id = new.buyer_id and created_at > now() - interval '24 hours') then
      perform public.raise_risk_event('topup_many_numbers', 'medium', null, new.buyer_id, jsonb_build_object('numbers_24h', v_numbers));
    end if;
  elsif new.status = 'failed' and old.status <> 'failed' then
    select count(*) into v_failed from public.topups
     where buyer_id = new.buyer_id and source <> 'reward' and status = 'failed' and updated_at > now() - interval '24 hours';
    if v_failed >= 3 and not exists (select 1 from public.risk_events where kind = 'topup_failures'
         and subject_user_id = new.buyer_id and created_at > now() - interval '24 hours') then
      perform public.raise_risk_event('topup_failures', 'low', null, new.buyer_id, jsonb_build_object('failed_24h', v_failed));
    end if;
  end if;
  return null;
end;
$$;
create trigger topups_risk after insert or update of status on public.topups
  for each row execute function public.topup_risk_rules();

-- ---------------------------------------------------------------- user and admin functions

/** The signed-in user's recent top-ups (for the Crédit & Data screen and receipts). */
create function public.my_topups(p_limit int default 20)
returns table (id uuid, beneficiary_msisdn text, beneficiary_name text, operator public.airtime_operator, product_label text,
               type public.airtime_product_type, amount_xof bigint, source public.topup_source, status public.topup_status,
               source_currency public.currency_code, source_amount bigint, created_at timestamptz, delivered_at timestamptz,
               product_id uuid, failure_code text)
language sql stable security definer set search_path = public as $$
  select t.id, t.beneficiary_msisdn, t.beneficiary_name, t.operator, p.label, p.type, t.amount_xof, t.source, t.status,
         t.source_currency, t.source_amount, t.created_at, t.delivered_at, t.product_id, t.failure_code
    from public.topups t join public.airtime_products p on p.id = t.product_id
   where t.buyer_id = auth.uid()
   order by t.created_at desc
   limit least(p_limit, 100);
$$;

create function public.admin_set_reward_rule(p_trigger public.reward_trigger, p_product_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before public.reward_rules;
begin
  if not public.is_admin() then
    raise exception 'only admins can change reward rules' using errcode = '42501';
  end if;
  if not exists (select 1 from public.airtime_products where id = p_product_id and type = 'data') then
    raise exception 'rewards must be data bundles' using errcode = '22023';
  end if;
  select * into v_before from public.reward_rules where trigger = p_trigger;
  update public.reward_rules set product_id = p_product_id, active = p_active, updated_at = now() where trigger = p_trigger;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'reward.rule', 'reward_rules', p_trigger::text,
          jsonb_build_object('before', to_jsonb(v_before), 'product_id', p_product_id, 'active', p_active));
end;
$$;

create function public.admin_set_reward_settings(p_per_user_cap_xof bigint, p_month_budget_xof bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', now())::date;
  v_before jsonb;
begin
  if not public.is_admin() then
    raise exception 'only admins can change the rewards budget' using errcode = '42501';
  end if;
  if p_per_user_cap_xof < 0 or p_month_budget_xof < 0 then
    raise exception 'amounts must be positive' using errcode = '22023';
  end if;
  select jsonb_build_object('cap', s.per_user_monthly_cap_xof, 'budget', b.budget_xof) into v_before
    from public.reward_settings s left join public.reward_budgets b on b.month = v_month;
  update public.reward_settings set per_user_monthly_cap_xof = p_per_user_cap_xof,
         default_monthly_budget_xof = p_month_budget_xof, updated_at = now();
  insert into public.reward_budgets (month, budget_xof) values (v_month, p_month_budget_xof)
  on conflict (month) do update set budget_xof = excluded.budget_xof;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'reward.settings', 'reward_settings', v_month::text,
          jsonb_build_object('before', v_before, 'cap', p_per_user_cap_xof, 'budget', p_month_budget_xof));
end;
$$;

create function public.admin_set_airtime_product(p_product_id uuid, p_price_xof bigint, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before public.airtime_products;
begin
  if not public.is_admin() then
    raise exception 'only admins can change the catalogue' using errcode = '42501';
  end if;
  if p_price_xof <= 0 then
    raise exception 'price must be positive' using errcode = '22023';
  end if;
  select * into v_before from public.airtime_products where id = p_product_id;
  update public.airtime_products set price_xof = p_price_xof, active = p_active, updated_at = now() where id = p_product_id;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'airtime.product', 'airtime_products', p_product_id::text,
          jsonb_build_object('before', jsonb_build_object('price_xof', v_before.price_xof, 'active', v_before.active),
                             'price_xof', p_price_xof, 'active', p_active));
end;
$$;

/** Rewards spent per day this month, for the budget burn chart (staff only). */
create function public.admin_reward_burn()
returns table (day date, granted_xof bigint, grants int, skipped int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query
    select created_at::date, coalesce(sum(cost_xof) filter (where status in ('granted', 'delivered')), 0)::bigint,
           (count(*) filter (where status in ('granted', 'delivered')))::int, (count(*) filter (where status = 'skipped'))::int
      from public.reward_grants where month = date_trunc('month', now())::date
     group by 1 order by 1;
end;
$$;

-- ---------------------------------------------------------------- grants

revoke all on function public.create_topup(uuid, text, text, public.airtime_operator, uuid, text, public.currency_code, text),
  public.sync_topup_payment(), public.claim_topups(int), public.mark_topup_sent(uuid, text, public.payment_status, text),
  public.complete_topup(text, public.payment_status, text), public.grant_reward(public.reward_trigger, uuid, text, uuid),
  public.reward_contribution(), public.reward_clean_cycle(), public.topup_risk_rules(), public.stamp_contribution_paid(),
  public.my_topups(int), public.admin_set_reward_rule(public.reward_trigger, uuid, boolean),
  public.admin_set_reward_settings(bigint, bigint), public.admin_set_airtime_product(uuid, bigint, boolean),
  public.admin_reward_burn(), public.operator_for_msisdn(text)
  from public, anon, authenticated;
grant execute on function public.create_topup(uuid, text, text, public.airtime_operator, uuid, text, public.currency_code, text),
  public.claim_topups(int), public.mark_topup_sent(uuid, text, public.payment_status, text),
  public.complete_topup(text, public.payment_status, text), public.grant_reward(public.reward_trigger, uuid, text, uuid)
  to service_role;
grant execute on function public.my_topups(int), public.admin_set_reward_rule(public.reward_trigger, uuid, boolean),
  public.admin_set_reward_settings(bigint, bigint), public.admin_set_airtime_product(uuid, bigint, boolean),
  public.admin_reward_burn(), public.operator_for_msisdn(text)
  to authenticated, service_role;
