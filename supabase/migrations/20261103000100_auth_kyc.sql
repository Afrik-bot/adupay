-- Phase 4: onboarding, tiered KYC with private document storage, and KYC limits
-- enforced inside create_payment.
--   Tier 0  phone only            can join a tontine, no payments
--   Tier 1  ID + selfie approved  200 000 FCFA per day
--   Tier 2  + proof of address    2 000 000 FCFA per day

-- ---------------------------------------------------------------- onboarding

alter table public.profiles add column onboarded_at timestamptz;
grant update (onboarded_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------- KYC documents

-- Private bucket: files live under <user id>/..., readable only by their owner
-- and admins, and only ever handed out as short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc-documents', 'kyc-documents', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy kyc_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy kyc_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'kyc-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
-- No update or delete policies: submitted evidence cannot be swapped afterwards.

-- A document must point into the submitter's own folder, and only one review
-- per document type can be pending at a time.
drop policy kyc_insert on public.kyc_records;
create policy kyc_insert on public.kyc_records for insert to authenticated
  with check (
    user_id = auth.uid() and status = 'pending' and reviewed_by is null
    and document_path like auth.uid()::text || '/%'
    and tier_requested = case when document_type = 'proof_of_address' then 2 else 1 end
  );
create unique index kyc_records_one_pending on public.kyc_records (user_id, document_type) where status = 'pending';

-- ---------------------------------------------------------------- limits

create function public.kyc_daily_limit_xof(p_tier smallint) returns bigint
language sql immutable as $$
  select case p_tier when 1 then 200000 when 2 then 2000000 else 0 end::bigint;
$$;

-- XOF value of an amount, rounded up so limits are never under-counted.
-- EUR is the fixed CFA peg; USD and CAD use the sandbox rates until the
-- admin-editable FX table arrives (phase 8).
create function public.xof_equivalent(p_amount bigint, p_currency public.currency_code) returns bigint
language sql immutable as $$
  select case p_currency
    when 'XOF' then p_amount
    when 'EUR' then (p_amount * 655957 + 99999) / 100000
    when 'USD' then p_amount * 6
    when 'CAD' then (p_amount * 44 + 9) / 10
  end;
$$;

-- What a user has paid in today (UTC, which is Abidjan time), excluding failures.
create function public.daily_usage_xof(p_user_id uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(public.xof_equivalent(amount, currency)), 0)::bigint
    from public.payments
   where user_id = p_user_id
     and direction = 'collect'
     and status <> 'failed'
     and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
$$;

-- create_payment, now with KYC limits on money a user pays in. A retry of an
-- existing payment returns it without re-checking, so retries never fail on a
-- limit the original already passed.
create or replace function public.create_payment(
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
  v_tier smallint;
  v_limit bigint;
  v_used bigint;
begin
  select currency into v_account_currency from public.ledger_accounts where id = p_ledger_account_id;
  if v_account_currency is distinct from p_currency then
    raise exception 'payment currency must match its ledger account' using errcode = '22023';
  end if;

  select * into v_payment from public.payments where idempotency_key = p_idempotency_key;
  if v_payment.id is null and p_user_id is not null and p_direction = 'collect' then
    -- Lock the profile so two concurrent payments cannot both fit under the limit.
    select kyc_tier into v_tier from public.profiles where id = p_user_id for update;
    if not found then
      raise exception 'unknown user %', p_user_id using errcode = '22023';
    end if;
    v_limit := public.kyc_daily_limit_xof(v_tier);
    if v_limit = 0 then
      raise exception 'kyc_tier_0: identity verification is required before making payments'
        using errcode = 'P0003';
    end if;
    v_used := public.daily_usage_xof(p_user_id);
    if v_used + public.xof_equivalent(p_amount, p_currency) > v_limit then
      raise exception 'kyc_daily_limit: % XOF used of % XOF today', v_used, v_limit using errcode = 'P0003';
    end if;
  end if;

  if v_payment.id is null then
    insert into public.payments (idempotency_key, user_id, direction, provider, amount, currency,
                                 ledger_account_id, purpose_type, purpose_id)
    values (p_idempotency_key, p_user_id, p_direction, p_provider, p_amount, p_currency,
            p_ledger_account_id, p_purpose_type, p_purpose_id)
    on conflict (idempotency_key) do nothing
    returning * into v_payment;

    if v_payment.id is not null then
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
    end if;
    -- Lost a race with a concurrent request using the same key.
    select * into v_payment from public.payments where idempotency_key = p_idempotency_key;
  end if;

  if v_payment.amount <> p_amount or v_payment.currency <> p_currency or v_payment.direction <> p_direction
     or v_payment.ledger_account_id <> p_ledger_account_id then
    raise exception 'idempotency key % reused with a different payment', p_idempotency_key using errcode = '23505';
  end if;
  return v_payment;
end;
$$;

-- ---------------------------------------------------------------- review

-- Admin decision on one submitted document. Raises the user's tier once the
-- documents for it are all approved, and records the decision in audit_log.
create function public.review_kyc_record(
  p_record_id uuid, p_decision public.review_status, p_reason text default null
) returns smallint
language plpgsql security definer set search_path = public as $$
declare
  v_record public.kyc_records;
  v_has_id boolean;
  v_has_selfie boolean;
  v_has_address boolean;
  v_tier smallint;
begin
  if not public.is_admin() then
    raise exception 'only admins can review KYC' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and coalesce(trim(p_reason), '') = '' then
    raise exception 'a rejection needs a reason the user can act on' using errcode = '22023';
  end if;

  update public.kyc_records
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
         rejection_reason = case when p_decision = 'rejected' then p_reason end
   where id = p_record_id and status = 'pending'
  returning * into v_record;
  if not found then
    raise exception 'no pending KYC record %', p_record_id using errcode = '22023';
  end if;

  select bool_or(document_type in ('cni', 'passport', 'residence_permit')),
         bool_or(document_type = 'selfie'),
         bool_or(document_type = 'proof_of_address')
    into v_has_id, v_has_selfie, v_has_address
    from public.kyc_records
   where user_id = v_record.user_id and status = 'approved';

  v_tier := case
    when v_has_id and v_has_selfie and v_has_address then 2
    when v_has_id and v_has_selfie then 1
    else 0 end;

  update public.profiles set kyc_tier = greatest(kyc_tier, v_tier)
   where id = v_record.user_id
  returning kyc_tier into v_tier;

  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'kyc.review', 'kyc_records', v_record.id::text,
          jsonb_build_object('user_id', v_record.user_id, 'document_type', v_record.document_type,
                             'decision', p_decision, 'reason', p_reason, 'kyc_tier', v_tier));
  return v_tier;
end;
$$;

-- What the signed-in user can still do today; shown on Profil.
create function public.my_kyc_status()
returns table (kyc_tier smallint, daily_limit_xof bigint, used_today_xof bigint)
language sql stable security definer set search_path = public as $$
  select p.kyc_tier, public.kyc_daily_limit_xof(p.kyc_tier), public.daily_usage_xof(p.id)
    from public.profiles p
   where p.id = auth.uid();
$$;

-- daily_usage_xof takes any user id, so it stays server-only; users get my_kyc_status.
revoke execute on function public.daily_usage_xof from public, anon, authenticated;
grant execute on function public.daily_usage_xof to service_role;
revoke execute on function public.review_kyc_record, public.my_kyc_status from public, anon;
grant execute on function public.review_kyc_record, public.my_kyc_status to authenticated, service_role;
revoke execute on function public.create_payment from public, anon, authenticated;
grant execute on function public.create_payment to service_role;
