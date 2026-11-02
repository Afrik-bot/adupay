-- Ledger core: double-entry posting, derived balances, payment lifecycle and
-- reconciliation. Every function that moves money is security definer, runs in
-- one transaction, and is executable only by service_role (server code).

alter table public.ledger_transactions add column request_hash text not null default '';
create unique index risk_events_once_per_payment on public.risk_events (kind, payment_id) where payment_id is not null;

-- System accounts, one per currency.
--   partner_settlement: money held for AduPay users at the licensed partner (asset, debit-normal)
--   payouts_in_transit: funds reserved for payouts sent to a rail but not yet confirmed
--   fee_revenue:        AduPay fees earned
insert into public.ledger_accounts (code, owner_type, currency, normal_side, allow_negative)
select 'system:' || name || ':' || cur, 'system', cur::public.currency_code, side::public.ledger_side, false
  from unnest(array['partner_settlement', 'payouts_in_transit', 'fee_revenue']) as name
 cross join unnest(array['XOF', 'EUR', 'USD', 'CAD']) as cur
 cross join lateral (select case when name = 'partner_settlement' then 'debit' else 'credit' end as side) s;

create function public.system_account(p_name text, p_currency public.currency_code) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.ledger_accounts where code = 'system:' || p_name || ':' || p_currency;
$$;

-- Owner accounts (user wallets, group pots, payees) are liabilities: credit-normal, never negative.
create function public.ensure_ledger_account(
  p_owner_type public.ledger_owner_type, p_owner_id uuid, p_currency public.currency_code
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_code text := p_owner_type || ':' || p_owner_id || ':' || p_currency;
  v_id uuid;
begin
  if p_owner_type = 'system' then
    raise exception 'system accounts are created by migration' using errcode = '22023';
  end if;
  insert into public.ledger_accounts (code, owner_type, owner_id, currency, normal_side)
  values (v_code, p_owner_type, p_owner_id, p_currency, 'credit')
  on conflict (code) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.ledger_accounts where code = v_code;
  end if;
  return v_id;
end;
$$;

create function public.account_balance(p_account_id uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when e.side = a.normal_side then e.amount else -e.amount end), 0)::bigint
    from public.ledger_accounts a
    left join public.ledger_entries e on e.account_id = a.id
   where a.id = p_account_id
   group by a.id;
$$;

-- Posts one balanced transaction. p_entries: [{"account_id": uuid, "side": "debit"|"credit", "amount": int}].
-- Replaying the same idempotency key with the same entries returns the original
-- transaction; replaying it with different entries is an error.
create function public.post_ledger_transaction(
  p_idempotency_key text,
  p_kind text,
  p_entries jsonb,
  p_description text default null,
  p_payment_id uuid default null,
  p_created_by uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  v_tx uuid;
  v_existing_hash text;
  v_entry jsonb;
  v_amount numeric;
  v_account record;
  v_net bigint;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 2 then
    raise exception 'a transaction needs at least two entries' using errcode = '22023';
  end if;

  v_hash := md5(p_kind || '|' || (
    select string_agg((e ->> 'account_id') || ':' || (e ->> 'side') || ':' || (e ->> 'amount'), ',' order by ord)
      from jsonb_array_elements(p_entries) with ordinality as x(e, ord)));

  insert into public.ledger_transactions (idempotency_key, kind, description, payment_id, created_by, request_hash)
  values (p_idempotency_key, p_kind, p_description, p_payment_id, p_created_by, v_hash)
  on conflict (idempotency_key) do nothing
  returning id into v_tx;

  if v_tx is null then
    select id, request_hash into v_tx, v_existing_hash
      from public.ledger_transactions where idempotency_key = p_idempotency_key;
    if v_existing_hash <> v_hash then
      raise exception 'idempotency key % reused with a different request', p_idempotency_key using errcode = '23505';
    end if;
    return v_tx;
  end if;

  -- Lock touched accounts in a fixed order so concurrent postings serialise
  -- per account without deadlocking.
  perform 1 from public.ledger_accounts
   where id in (select (e ->> 'account_id')::uuid from jsonb_array_elements(p_entries) e)
   order by id
   for update;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(v_entry -> 'amount') <> 'number' then
      raise exception 'amount must be a number' using errcode = '22023';
    end if;
    v_amount := (v_entry ->> 'amount')::numeric;
    if v_amount <= 0 or v_amount <> trunc(v_amount) then
      raise exception 'amount must be a positive integer in minor units, got %', v_amount using errcode = '22023';
    end if;
    if (v_entry ->> 'side') not in ('debit', 'credit') then
      raise exception 'side must be debit or credit' using errcode = '22023';
    end if;
    select id, currency into v_account from public.ledger_accounts where id = (v_entry ->> 'account_id')::uuid;
    if not found then
      raise exception 'unknown ledger account %', v_entry ->> 'account_id' using errcode = '22023';
    end if;
    insert into public.ledger_entries (transaction_id, account_id, side, amount, currency)
    values (v_tx, v_account.id, (v_entry ->> 'side')::public.ledger_side, v_amount::bigint, v_account.currency);
  end loop;

  -- Balanced per currency (the deferred trigger re-checks at commit).
  select sum(case when side = 'debit' then amount else -amount end) into v_net
    from public.ledger_entries where transaction_id = v_tx
   group by currency
  having sum(case when side = 'debit' then amount else -amount end) <> 0
   limit 1;
  if v_net is not null then
    raise exception 'unbalanced transaction: debits and credits differ by %', v_net using errcode = 'P0001';
  end if;

  -- No overdrafts on accounts that must stay non-negative.
  for v_account in
    select a.id, a.code from public.ledger_accounts a
     where a.allow_negative = false
       and a.id in (select account_id from public.ledger_entries where transaction_id = v_tx)
  loop
    if public.account_balance(v_account.id) < 0 then
      raise exception 'insufficient funds in %', v_account.code using errcode = 'P0002';
    end if;
  end loop;

  return v_tx;
end;
$$;

-- ---------------------------------------------------------------- payments

create function public.create_payment(
  p_idempotency_key text,
  p_user_id uuid,
  p_direction public.payment_direction,
  p_provider text,
  p_amount bigint,
  p_currency public.currency_code,
  p_ledger_account_id uuid,
  p_purpose_type text default null,
  p_purpose_id uuid default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
  v_account_currency public.currency_code;
begin
  select currency into v_account_currency from public.ledger_accounts where id = p_ledger_account_id;
  if v_account_currency is distinct from p_currency then
    raise exception 'payment currency must match its ledger account' using errcode = '22023';
  end if;

  insert into public.payments (idempotency_key, user_id, direction, provider, amount, currency,
                               ledger_account_id, purpose_type, purpose_id)
  values (p_idempotency_key, p_user_id, p_direction, p_provider, p_amount, p_currency,
          p_ledger_account_id, p_purpose_type, p_purpose_id)
  on conflict (idempotency_key) do nothing
  returning * into v_payment;

  if v_payment.id is null then
    select * into v_payment from public.payments where idempotency_key = p_idempotency_key;
    if v_payment.amount <> p_amount or v_payment.currency <> p_currency or v_payment.direction <> p_direction
       or v_payment.ledger_account_id <> p_ledger_account_id then
      raise exception 'idempotency key % reused with a different payment', p_idempotency_key using errcode = '23505';
    end if;
    return v_payment;
  end if;

  -- A payout reserves its funds up front so the source account cannot be spent twice.
  if p_direction = 'payout' then
    perform public.post_ledger_transaction(
      'payout-hold:' || v_payment.id, 'payout_hold',
      jsonb_build_array(
        jsonb_build_object('account_id', p_ledger_account_id, 'side', 'debit', 'amount', p_amount),
        jsonb_build_object('account_id', public.system_account('payouts_in_transit', p_currency), 'side', 'credit', 'amount', p_amount)),
      null, v_payment.id);
  end if;

  return v_payment;
end;
$$;

create function public.attach_provider_ref(p_payment_id uuid, p_provider_ref text) returns void
language sql security definer set search_path = public as $$
  update public.payments set provider_ref = p_provider_ref
   where id = p_payment_id and (provider_ref is null or provider_ref = p_provider_ref);
$$;

create function public.raise_risk_event(
  p_kind text, p_severity public.risk_severity, p_payment_id uuid, p_user_id uuid, p_details jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into public.risk_events (kind, severity, payment_id, subject_user_id, details)
  values (p_kind, p_severity, p_payment_id, p_user_id, coalesce(p_details, '{}'))
  on conflict (kind, payment_id) where payment_id is not null do nothing;
$$;

-- Applies a final rail status. Safe to call repeatedly (webhook retries,
-- reconciliation): a repeated status is a no-op, a conflicting one is flagged.
create function public.settle_payment(
  p_payment_id uuid, p_status public.payment_status, p_failure_code text default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
  v_settlement uuid;
  v_in_transit uuid;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'unknown payment %', p_payment_id using errcode = '22023';
  end if;

  if p_status = 'pending' or v_payment.status = p_status then
    return v_payment;
  end if;

  if v_payment.status <> 'pending' then
    perform public.raise_risk_event('conflicting_settlement', 'high', v_payment.id, v_payment.user_id,
      jsonb_build_object('recorded', v_payment.status, 'received', p_status));
    return v_payment;
  end if;

  v_settlement := public.system_account('partner_settlement', v_payment.currency);
  v_in_transit := public.system_account('payouts_in_transit', v_payment.currency);

  if p_status = 'succeeded' and v_payment.direction = 'collect' then
    perform public.post_ledger_transaction('payment-settle:' || v_payment.id, 'collect',
      jsonb_build_array(
        jsonb_build_object('account_id', v_settlement, 'side', 'debit', 'amount', v_payment.amount),
        jsonb_build_object('account_id', v_payment.ledger_account_id, 'side', 'credit', 'amount', v_payment.amount)),
      null, v_payment.id);
  elsif p_status = 'succeeded' and v_payment.direction = 'payout' then
    perform public.post_ledger_transaction('payment-settle:' || v_payment.id, 'payout',
      jsonb_build_array(
        jsonb_build_object('account_id', v_in_transit, 'side', 'debit', 'amount', v_payment.amount),
        jsonb_build_object('account_id', v_settlement, 'side', 'credit', 'amount', v_payment.amount)),
      null, v_payment.id);
  elsif p_status = 'failed' and v_payment.direction = 'payout' then
    perform public.post_ledger_transaction('payout-release:' || v_payment.id, 'payout_release',
      jsonb_build_array(
        jsonb_build_object('account_id', v_in_transit, 'side', 'debit', 'amount', v_payment.amount),
        jsonb_build_object('account_id', v_payment.ledger_account_id, 'side', 'credit', 'amount', v_payment.amount)),
      null, v_payment.id);
  end if;
  -- A failed collect moved no money, so it posts nothing.

  update public.payments set status = p_status, failure_code = p_failure_code
   where id = v_payment.id
  returning * into v_payment;
  return v_payment;
end;
$$;

create function public.settle_payment_by_ref(
  p_provider text, p_provider_ref text, p_status public.payment_status, p_failure_code text default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from public.payments where provider = p_provider and provider_ref = p_provider_ref;
  if v_id is null then
    raise exception 'unknown provider reference' using errcode = '22023';
  end if;
  return public.settle_payment(v_id, p_status, p_failure_code);
end;
$$;

-- Compares what the rail reports with what AduPay recorded.
-- Returns 'ok', 'pending', 'settled' (a missed webhook was applied) or 'mismatch'.
create function public.reconcile_payment(
  p_payment_id uuid, p_provider_status public.payment_status, p_failure_code text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
  v_has_settlement boolean;
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if not found then
    raise exception 'unknown payment %', p_payment_id using errcode = '22023';
  end if;

  if p_provider_status = 'pending' then
    if v_payment.status = 'pending' and v_payment.created_at < now() - interval '1 hour' then
      perform public.raise_risk_event('stale_pending', 'medium', v_payment.id, v_payment.user_id,
        jsonb_build_object('age_minutes', round(extract(epoch from now() - v_payment.created_at) / 60)));
    elsif v_payment.status <> 'pending' then
      perform public.raise_risk_event('status_mismatch', 'high', v_payment.id, v_payment.user_id,
        jsonb_build_object('recorded', v_payment.status, 'provider', p_provider_status));
      return 'mismatch';
    end if;
    return 'pending';
  end if;

  if v_payment.status = 'pending' then
    perform public.settle_payment(v_payment.id, p_provider_status, p_failure_code);
    return 'settled';
  end if;

  if v_payment.status <> p_provider_status then
    perform public.raise_risk_event('status_mismatch', 'high', v_payment.id, v_payment.user_id,
      jsonb_build_object('recorded', v_payment.status, 'provider', p_provider_status));
    return 'mismatch';
  end if;

  if v_payment.status = 'succeeded' then
    select exists (select 1 from public.ledger_transactions where idempotency_key = 'payment-settle:' || v_payment.id)
      into v_has_settlement;
    if not v_has_settlement then
      perform public.raise_risk_event('ledger_missing', 'high', v_payment.id, v_payment.user_id, '{}'::jsonb);
      return 'mismatch';
    end if;
  end if;
  return 'ok';
end;
$$;

-- Payments the reconciliation job should check: everything still pending, plus
-- anything that changed since p_since (to catch late reversals by the rail).
create function public.payments_to_reconcile(p_provider text, p_since timestamptz, p_limit int default 500)
returns setof public.payments
language sql stable security definer set search_path = public as $$
  select * from public.payments
   where provider = p_provider and provider_ref is not null
     and (status = 'pending' or updated_at >= p_since)
   order by created_at
   limit p_limit;
$$;

-- Signed-in user's own balances, derived from the ledger.
create function public.my_balances() returns table (currency public.currency_code, balance bigint)
language sql stable security definer set search_path = public as $$
  select a.currency, public.account_balance(a.id)
    from public.ledger_accounts a
   where a.owner_type = 'user' and a.owner_id = auth.uid();
$$;

revoke execute on function public.system_account, public.ensure_ledger_account, public.account_balance,
  public.post_ledger_transaction, public.create_payment, public.attach_provider_ref, public.raise_risk_event,
  public.settle_payment, public.settle_payment_by_ref, public.reconcile_payment, public.payments_to_reconcile, public.my_balances
  from public, anon, authenticated;
grant execute on function public.system_account, public.ensure_ledger_account, public.account_balance,
  public.post_ledger_transaction, public.create_payment, public.attach_provider_ref, public.raise_risk_event,
  public.settle_payment, public.settle_payment_by_ref, public.reconcile_payment, public.payments_to_reconcile
  to service_role;
grant execute on function public.my_balances to authenticated;
