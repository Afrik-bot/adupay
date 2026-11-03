-- Phase 8: Payer pour (diaspora directed payments).
--   card collect (EUR/USD/CAD)  ->  fx_clearing:<cur>
--   on success: fee -> fee_revenue:<cur>; FX conversion fx_clearing:XOF -> payee (or tontine pot)
--   payout payee -> rail ("Reçu");  payee confirms in Phase 9 ("Confirmé")

-- ---------------------------------------------------------------- FX and fees

create table public.fx_rates (
  currency public.currency_code primary key check (currency <> 'XOF'),
  xof_per_unit numeric(14, 6) not null check (xof_per_unit > 0),
  fee_bps int not null check (fee_bps between 0 and 1000),
  fx_margin_bps int not null default 0 check (fx_margin_bps between 0 and 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
-- Sandbox defaults: EUR at the fixed CFA peg, fee 1.9 %, no FX margin.
insert into public.fx_rates (currency, xof_per_unit, fee_bps) values
  ('EUR', 655.957, 190), ('USD', 600, 190), ('CAD', 440, 190);

alter table public.fx_rates enable row level security;
revoke all on public.fx_rates from anon;
revoke insert, update, delete, truncate on public.fx_rates from authenticated;
grant select on public.fx_rates to authenticated;
grant all on public.fx_rates to service_role;
create policy fx_rates_select on public.fx_rates for select to authenticated using (true);

-- Admins edit rates (the admin console UI arrives in Phase 11).
create function public.set_fx_rate(
  p_currency public.currency_code, p_xof_per_unit numeric, p_fee_bps int, p_fx_margin_bps int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before public.fx_rates;
begin
  if not public.is_admin() then
    raise exception 'only admins can change FX rates' using errcode = '42501';
  end if;
  select * into v_before from public.fx_rates where currency = p_currency;
  update public.fx_rates
     set xof_per_unit = p_xof_per_unit, fee_bps = p_fee_bps, fx_margin_bps = p_fx_margin_bps,
         updated_at = now(), updated_by = auth.uid()
   where currency = p_currency;
  if not found then
    raise exception 'unknown currency %', p_currency using errcode = '22023';
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'fx.update', 'fx_rates', p_currency::text,
          jsonb_build_object('before', to_jsonb(v_before), 'xof_per_unit', p_xof_per_unit,
                             'fee_bps', p_fee_bps, 'fx_margin_bps', p_fx_margin_bps));
end;
$$;

-- KYC limits now value foreign currency with the admin table (same results as
-- before for the sandbox defaults). Rounded up so limits are never under-counted.
create or replace function public.xof_equivalent(p_amount bigint, p_currency public.currency_code) returns bigint
language sql stable security definer set search_path = public as $$
  select case
    when p_currency = 'XOF' then p_amount
    else ceil(p_amount * coalesce((select xof_per_unit from public.fx_rates where currency = p_currency),
                                  case p_currency when 'EUR' then 655.957 when 'USD' then 600 else 440 end) / 100)::bigint
  end;
$$;

-- What a sender pays for a given FCFA amount. base and fee are in cents.
-- all_in_pct is fee + FX margin, against the mid-market cost (FR-5).
create function public.fx_quote(p_amount_xof bigint, p_currency public.currency_code)
returns table (currency public.currency_code, xof_per_unit numeric, customer_rate numeric, fee_bps int,
               fx_margin_bps int, base_amount bigint, fee_amount bigint, total_amount bigint, all_in_pct numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_rate public.fx_rates;
  v_customer numeric;
  v_base bigint;
  v_fee bigint;
  v_mid numeric;
begin
  if p_amount_xof < 1000 or p_amount_xof > 2000000 then
    raise exception 'amount must be between 1 000 and 2 000 000 FCFA' using errcode = '22023';
  end if;
  select * into v_rate from public.fx_rates r where r.currency = p_currency;
  if not found then
    raise exception 'unsupported currency %', p_currency using errcode = '22023';
  end if;
  v_customer := round(v_rate.xof_per_unit * (1 - v_rate.fx_margin_bps / 10000.0), 6);
  v_base := ceil(p_amount_xof * 100 / v_customer)::bigint;
  v_fee := (v_base * v_rate.fee_bps * 2 + 10000) / 20000;
  v_mid := p_amount_xof * 100 / v_rate.xof_per_unit;
  return query select p_currency, v_rate.xof_per_unit, v_customer, v_rate.fee_bps, v_rate.fx_margin_bps,
                      v_base, v_fee, v_base + v_fee, round((v_base + v_fee - v_mid) / v_mid * 100, 2);
end;
$$;

insert into public.ledger_accounts (code, owner_type, currency, normal_side, allow_negative)
select 'system:fx_clearing:' || cur, 'system', cur::public.currency_code, 'credit', true
  from unnest(array['XOF', 'EUR', 'USD', 'CAD']) as cur;

-- ---------------------------------------------------------------- payees and directed payments

-- Sandbox payout tokens for verified payees (a real partner issues these at KYB).
alter table public.payees add column payout_account_token text;
update public.payees
   set payout_account_token = 'sbxacct_' || left(replace(id::text, '-', ''), 8) || '_9990'
 where kyb_status = 'approved' and payout_account_token is null;

alter table public.directed_payments
  add column request_key text unique,
  add column contribution_id uuid references public.contributions (id),
  add column schedule_id uuid,
  add column schedule_run_on date,
  add column share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  add column card_brand text,
  add column card_last4 text check (card_last4 is null or card_last4 ~ '^\d{4}$'),
  add column paid_at timestamptz,
  add column received_at timestamptz,
  add column confirmed_at timestamptz,
  add column failure_code text;
create unique index directed_payments_schedule_run on public.directed_payments (schedule_id, schedule_run_on) where schedule_id is not null;

-- Which payee categories each purpose may pay.
create function public.purpose_categories(p_purpose public.payment_purpose) returns public.payee_category[]
language sql immutable as $$
  select case p_purpose
    when 'school' then array['school']::public.payee_category[]
    when 'health' then array['clinic', 'pharmacy']::public.payee_category[]
    when 'bills' then array['utility']::public.payee_category[]
    when 'rent' then array['landlord']::public.payee_category[]
    else array[]::public.payee_category[] end;
$$;

-- FR-4, enforced in the database: Payer pour only ever pays a KYB-verified payee
-- of the right kind, or (for tontine shares) a group's pot.
create function public.check_directed_payee() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_payee public.payees;
begin
  if new.purpose = 'tontine' then
    return new;
  end if;
  select * into v_payee from public.payees where id = new.payee_id;
  if not found or v_payee.kyb_status <> 'approved' then
    raise exception 'payee_not_verified: payments only go to verified payees' using errcode = 'P0001';
  end if;
  if not v_payee.category = any (public.purpose_categories(new.purpose)) then
    raise exception 'payee_wrong_category' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger directed_payments_verified_payee
  before insert or update of payee_id, purpose on public.directed_payments
  for each row execute function public.check_directed_payee();

-- ---------------------------------------------------------------- schedules

create table public.directed_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  purpose public.payment_purpose not null,
  payee_id uuid references public.payees (id),
  group_id uuid references public.groups (id),
  beneficiary_name text not null,
  reference text,
  amount bigint not null check (amount > 0),
  source_currency public.currency_code not null check (source_currency <> 'XOF'),
  frequency text not null check (frequency in ('weekly', 'monthly')),
  next_run_on date not null,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  card_token text not null,
  card_brand text,
  card_last4 text,
  last_directed_payment_id uuid references public.directed_payments (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.directed_payments
  add constraint directed_payments_schedule_fk foreign key (schedule_id) references public.directed_payment_schedules (id);
create trigger schedules_touch before update on public.directed_payment_schedules
  for each row execute function public.touch_updated_at();

alter table public.directed_payment_schedules enable row level security;
revoke all on public.directed_payment_schedules from anon;
revoke insert, update, delete, truncate on public.directed_payment_schedules from authenticated;
-- The card token stays server-side: users may read every column but that one.
-- (Table-level SELECT from Supabase's default grants would override this.)
revoke select on public.directed_payment_schedules from authenticated;
grant select (id, sender_id, purpose, payee_id, group_id, beneficiary_name, reference, amount, source_currency,
              frequency, next_run_on, status, card_brand, card_last4, last_directed_payment_id, created_at, updated_at)
  on public.directed_payment_schedules to authenticated;
grant all on public.directed_payment_schedules to service_role;
create policy schedules_select on public.directed_payment_schedules for select to authenticated
  using (sender_id = auth.uid() or public.is_admin());

create function public.set_schedule_status(p_schedule_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('active', 'paused', 'cancelled') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update public.directed_payment_schedules set status = p_status
   where id = p_schedule_id and sender_id = auth.uid() and status <> 'cancelled';
  if not found then
    raise exception 'schedule not found or already cancelled' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------- sponsors (diaspora relatives in a tontine)

create function public.group_invite_members(p_invite_code text)
returns table (user_id uuid, first_name text)
language sql stable security definer set search_path = public as $$
  select m.user_id, split_part(coalesce(p.full_name, ''), ' ', 1)
    from public.groups g
    join public.group_members m on m.group_id = g.id and m.role <> 'sponsor'
    join public.profiles p on p.id = m.user_id
   where g.invite_code = lower(trim(p_invite_code)) and g.status in ('draft', 'active') and auth.uid() is not null
   order by m.payout_position nulls last, m.joined_at;
$$;

create function public.join_group_as_sponsor(p_invite_code text, p_member_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into v_group from public.groups where invite_code = lower(trim(p_invite_code)) and status in ('draft', 'active');
  if not found then
    raise exception 'invite_not_found' using errcode = '22023';
  end if;
  if exists (select 1 from public.group_members where group_id = v_group.id and user_id = auth.uid()) then
    raise exception 'already_member' using errcode = '22023';
  end if;
  if not exists (select 1 from public.group_members where group_id = v_group.id and user_id = p_member_id and role <> 'sponsor') then
    raise exception 'member_not_found' using errcode = '22023';
  end if;
  if exists (select 1 from public.group_members where group_id = v_group.id and sponsored_member_id = p_member_id) then
    raise exception 'already_sponsored' using errcode = '22023';
  end if;
  insert into public.group_members (group_id, user_id, role, sponsored_member_id)
  values (v_group.id, auth.uid(), 'sponsor', p_member_id);
  return v_group.id;
end;
$$;

create function public.my_sponsorships()
returns table (group_id uuid, group_name text, member_id uuid, member_name text, contribution_amount bigint,
               group_status public.group_status, cycle_number int, due_date date, paid boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, s.sponsored_member_id, p.full_name, g.contribution_amount, g.status, c.number, c.due_date,
         exists (select 1 from public.contributions k where k.cycle_id = c.id and k.member_id = s.sponsored_member_id and k.status = 'succeeded')
    from public.group_members s
    join public.groups g on g.id = s.group_id
    join public.profiles p on p.id = s.sponsored_member_id
    left join lateral (select * from public.current_cycle(g.id)) c on c.id is not null
   where s.user_id = auth.uid() and s.role = 'sponsor'
   order by g.name;
$$;

-- ---------------------------------------------------------------- creating a directed payment (server only)

create function public.create_directed_payment(
  p_sender_id uuid,
  p_request_key text,
  p_purpose public.payment_purpose,
  p_payee_id uuid,
  p_group_id uuid,
  p_beneficiary_name text,
  p_reference text,
  p_amount_xof bigint,
  p_currency public.currency_code,
  p_card_brand text,
  p_card_last4 text,
  p_schedule_id uuid default null,
  p_schedule_run_on date default null
) returns public.directed_payments
language plpgsql security definer set search_path = public as $$
declare
  v_row public.directed_payments;
  v_quote record;
  v_amount bigint := p_amount_xof;
  v_contribution public.contributions;
  v_member uuid;
  v_cycle public.cycles;
begin
  select * into v_row from public.directed_payments
   where request_key = p_request_key
      or (p_schedule_id is not null and schedule_id = p_schedule_id and schedule_run_on = p_schedule_run_on);
  if found then
    return v_row;
  end if;
  if length(trim(coalesce(p_beneficiary_name, ''))) < 2 then
    raise exception 'beneficiary name required' using errcode = '22023';
  end if;

  if p_purpose = 'tontine' then
    select sponsored_member_id into v_member from public.group_members
     where group_id = p_group_id and user_id = p_sender_id and role = 'sponsor';
    if v_member is null then
      raise exception 'not_sponsor: you can only pay a tontine share for the member you sponsor' using errcode = '42501';
    end if;
    v_cycle := public.current_cycle(p_group_id);
    if v_cycle.id is null then
      raise exception 'cycle_closed' using errcode = '22023';
    end if;
    v_contribution := public.create_contribution(v_cycle.id, v_member, p_sender_id);
    v_amount := v_contribution.amount; -- the share (plus any confirmed penalty), not what was typed
  end if;

  select * into v_quote from public.fx_quote(v_amount, p_currency);
  insert into public.directed_payments (
    sender_id, payee_id, group_id, purpose, beneficiary_name, reference, amount, currency,
    source_currency, source_amount, fee_amount, fx_rate, status, request_key, contribution_id,
    schedule_id, schedule_run_on, card_brand, card_last4)
  values (
    p_sender_id, case when p_purpose = 'tontine' then null else p_payee_id end,
    case when p_purpose = 'tontine' then p_group_id end, p_purpose, trim(p_beneficiary_name),
    nullif(trim(coalesce(p_reference, '')), ''), v_amount, 'XOF',
    p_currency, v_quote.total_amount, v_quote.fee_amount, v_quote.customer_rate, 'initiated', p_request_key,
    v_contribution.id, p_schedule_id, p_schedule_run_on, p_card_brand, p_card_last4)
  returning * into v_row;
  return v_row;
end;
$$;

-- On card success: fee to AduPay, FX conversion into the payee's account (or the
-- tontine pot, which also settles the sponsored share). On failure: mark failed.
create function public.sync_directed_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_dp public.directed_payments;
  v_target uuid;
begin
  if new.purpose_id is null or new.status = 'pending' then
    return null;
  end if;

  if new.purpose_type = 'directed_payment' then
    select * into v_dp from public.directed_payments where id = new.purpose_id for update;
    if not found or v_dp.status not in ('initiated') then
      return null;
    end if;
    if new.status = 'failed' then
      update public.directed_payments set status = 'failed', payment_id = new.id, failure_code = new.failure_code where id = v_dp.id;
      if v_dp.contribution_id is not null then
        update public.contributions set status = 'failed' where id = v_dp.contribution_id and status = 'pending';
      end if;
      return null;
    end if;

    if v_dp.fee_amount > 0 then
      perform public.post_ledger_transaction('dp-fee:' || v_dp.id, 'directed_fee',
        jsonb_build_array(
          jsonb_build_object('account_id', public.system_account('fx_clearing', v_dp.source_currency), 'side', 'debit', 'amount', v_dp.fee_amount),
          jsonb_build_object('account_id', public.system_account('fee_revenue', v_dp.source_currency), 'side', 'credit', 'amount', v_dp.fee_amount)),
        'Frais Payer pour', new.id);
    end if;
    v_target := case when v_dp.purpose = 'tontine'
                     then public.ensure_ledger_account('group', v_dp.group_id, 'XOF')
                     else public.ensure_ledger_account('payee', v_dp.payee_id, 'XOF') end;
    -- The partner sells the base amount in EUR/USD/CAD and buys the FCFA amount.
    -- Each currency balances on its own; fx_clearing nets to zero.
    perform public.post_ledger_transaction('dp-fx:' || v_dp.id, 'directed_fx',
      jsonb_build_array(
        jsonb_build_object('account_id', public.system_account('fx_clearing', v_dp.source_currency), 'side', 'debit', 'amount', v_dp.source_amount - v_dp.fee_amount),
        jsonb_build_object('account_id', public.system_account('partner_settlement', v_dp.source_currency), 'side', 'credit', 'amount', v_dp.source_amount - v_dp.fee_amount),
        jsonb_build_object('account_id', public.system_account('partner_settlement', 'XOF'), 'side', 'debit', 'amount', v_dp.amount),
        jsonb_build_object('account_id', v_target, 'side', 'credit', 'amount', v_dp.amount)),
      'Conversion Payer pour', new.id);

    if v_dp.purpose = 'tontine' then
      -- Money is in the pot: the share is paid, and there is nothing left to deliver.
      update public.contributions set status = 'succeeded', payment_id = new.id where id = v_dp.contribution_id;
      update public.directed_payments
         set status = 'confirmed', payment_id = new.id, paid_at = now(), received_at = now(), confirmed_at = now()
       where id = v_dp.id;
    else
      update public.directed_payments set status = 'paid', payment_id = new.id, paid_at = now() where id = v_dp.id;
    end if;

  elsif new.purpose_type = 'directed_payout' and new.status = 'succeeded' then
    update public.directed_payments set status = 'received', received_at = now()
     where id = new.purpose_id and status = 'paid';
  end if;
  return null;
end;
$$;
create trigger payments_sync_directed
  after update of status on public.payments
  for each row execute function public.sync_directed_payment();

-- Paid directed payments still waiting to reach their payee (first send or retry).
create function public.directed_payouts_due()
returns table (directed_payment_id uuid, payee_id uuid, amount bigint, attempt int,
               payee_account_id uuid, payout_provider public.wallet_provider, payout_token text)
language sql stable security definer set search_path = public as $$
  select d.id, d.payee_id, d.amount,
         1 + (select count(*)::int from public.payments p where p.purpose_type = 'directed_payout' and p.purpose_id = d.id and p.status = 'failed'),
         -- created by the FX conversion when the card payment succeeded
         (select a.id from public.ledger_accounts a where a.code = 'payee:' || d.payee_id || ':XOF'),
         pe.payout_provider, pe.payout_account_token
    from public.directed_payments d
    join public.payees pe on pe.id = d.payee_id
   where d.status = 'paid' and pe.payout_account_token is not null
     and not exists (select 1 from public.payments p
                      where p.purpose_type = 'directed_payout' and p.purpose_id = d.id and p.status in ('pending', 'succeeded'))
     and (select count(*) from public.payments p where p.purpose_type = 'directed_payout' and p.purpose_id = d.id and p.status = 'failed') < 3;
$$;

-- Schedules whose next run is due; the runner charges the saved card token.
create function public.schedules_due(p_today date)
returns setof public.directed_payment_schedules
language sql stable security definer set search_path = public as $$
  select * from public.directed_payment_schedules where status = 'active' and next_run_on <= p_today order by next_run_on;
$$;

create function public.advance_schedule(p_schedule_id uuid, p_ran_on date, p_directed_payment_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.directed_payment_schedules
     set next_run_on = (p_ran_on + case frequency when 'weekly' then interval '7 days' else interval '1 month' end)::date,
         last_directed_payment_id = p_directed_payment_id
   where id = p_schedule_id and next_run_on = p_ran_on;
$$;

-- ---------------------------------------------------------------- sharing with family

-- What anyone with the share link sees: no amounts in foreign currency, no card,
-- no full reference, first names only.
create function public.directed_payment_public(p_share_token text)
returns table (purpose public.payment_purpose, payee_name text, group_name text, beneficiary_name text,
               sender_first_name text, amount bigint, status public.directed_payment_status,
               created_at timestamptz, paid_at timestamptz, received_at timestamptz, confirmed_at timestamptz,
               reference_hint text)
language sql stable security definer set search_path = public as $$
  select d.purpose, pe.name, g.name, d.beneficiary_name, split_part(coalesce(s.full_name, ''), ' ', 1), d.amount, d.status,
         d.created_at, d.paid_at, d.received_at, d.confirmed_at,
         case when d.reference is null then null else '…' || right(d.reference, 4) end
    from public.directed_payments d
    left join public.payees pe on pe.id = d.payee_id
    left join public.groups g on g.id = d.group_id
    join public.profiles s on s.id = d.sender_id
   where d.share_token = p_share_token and length(p_share_token) >= 24;
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function
  public.set_fx_rate, public.fx_quote, public.purpose_categories, public.check_directed_payee,
  public.set_schedule_status, public.group_invite_members, public.join_group_as_sponsor, public.my_sponsorships,
  public.create_directed_payment, public.sync_directed_payment, public.directed_payouts_due,
  public.schedules_due, public.advance_schedule, public.directed_payment_public
  from public, anon, authenticated;
grant execute on function
  public.set_fx_rate, public.fx_quote, public.purpose_categories, public.set_schedule_status,
  public.group_invite_members, public.join_group_as_sponsor, public.my_sponsorships
  to authenticated, service_role;
grant execute on function
  public.create_directed_payment, public.directed_payouts_due, public.schedules_due, public.advance_schedule
  to service_role;
grant execute on function public.directed_payment_public to anon, authenticated, service_role;
