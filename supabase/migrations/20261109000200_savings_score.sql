-- Phase 10, part 2: Épargne (savings goals) and Score Communauté.

-- ---------------------------------------------------------------- savings goals

alter table public.savings_goals
  add column auto_topup boolean not null default false,
  add column next_topup_on date,
  add column archived_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add constraint savings_goals_auto_needs_amount check (not auto_topup or weekly_topup_amount is not null);
create trigger savings_goals_touch before update on public.savings_goals for each row execute function public.touch_updated_at();
grant update (auto_topup, next_topup_on, archived_at) on public.savings_goals to authenticated;

-- Owners see their goal's ledger account and entries.
create or replace function public.can_see_ledger_account(p_account_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ledger_accounts a
     where a.id = p_account_id
       and (   (a.owner_type = 'user'  and a.owner_id = auth.uid())
            or (a.owner_type = 'group' and public.is_group_member(a.owner_id))
            or (a.owner_type = 'payee' and public.owns_payee(a.owner_id))
            or (a.owner_type = 'savings_goal'
                and exists (select 1 from public.savings_goals g where g.id = a.owner_id and g.user_id = auth.uid())))
  ) or public.is_admin();
$$;

-- Money rule: only the goal's owner pays into it, and nothing leaves a goal
-- before its lock date. Enforced here so every code path is covered.
create or replace function public.check_goal_payment(
  p_direction public.payment_direction, p_user_id uuid, p_ledger_account_id uuid
) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_goal public.savings_goals;
begin
  select g.* into v_goal
    from public.ledger_accounts a
    join public.savings_goals g on g.id = a.owner_id
   where a.id = p_ledger_account_id and a.owner_type = 'savings_goal';
  if not found then
    return;
  end if;
  if p_user_id is distinct from v_goal.user_id then
    raise exception 'goal_not_owner' using errcode = '42501';
  end if;
  if p_direction = 'payout' and v_goal.lock_until is not null and v_goal.lock_until > current_date then
    raise exception 'goal_locked: savings are locked until %', v_goal.lock_until using errcode = 'P0003';
  end if;
end;
$$;

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
  if v_payment.id is null then
    perform public.check_goal_payment(p_direction, p_user_id, p_ledger_account_id);
  end if;
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
    select * into v_payment from public.payments where idempotency_key = p_idempotency_key;
  end if;

  if v_payment.amount <> p_amount or v_payment.currency <> p_currency or v_payment.direction <> p_direction
     or v_payment.ledger_account_id <> p_ledger_account_id then
    raise exception 'idempotency key % reused with a different payment', p_idempotency_key using errcode = '23505';
  end if;
  return v_payment;
end;
$$;

-- The caller's goals with their balance (from the ledger).
create function public.my_goals()
returns table (id uuid, name text, kind text, target_amount bigint, currency public.currency_code, lock_until date,
               weekly_topup_amount bigint, auto_topup boolean, next_topup_on date, balance bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.kind, g.target_amount, g.currency, g.lock_until, g.weekly_topup_amount, g.auto_topup, g.next_topup_on,
         coalesce((select public.account_balance(a.id) from public.ledger_accounts a
                    where a.owner_type = 'savings_goal' and a.owner_id = g.id and a.currency = g.currency), 0)::bigint,
         g.created_at
    from public.savings_goals g
   where g.user_id = auth.uid() and g.archived_at is null
   order by g.created_at;
$$;

-- Weekly automatic top-ups due on or before p_today (server only).
create function public.goals_due_topup(p_today date)
returns table (goal_id uuid, user_id uuid, amount bigint, currency public.currency_code, run_on date)
language sql stable security definer set search_path = public as $$
  select id, user_id, weekly_topup_amount, currency, next_topup_on
    from public.savings_goals
   where auto_topup and archived_at is null and weekly_topup_amount is not null and next_topup_on <= p_today
   order by next_topup_on;
$$;

create function public.advance_goal_topup(p_goal_id uuid, p_ran_on date) returns void
language sql security definer set search_path = public as $$
  update public.savings_goals set next_topup_on = p_ran_on + 7 where id = p_goal_id and next_topup_on = p_ran_on;
$$;

-- The member's default linked account, for server-side collects and payouts.
create function public.default_payment_account(p_user_id uuid)
returns table (provider public.wallet_provider, account_token text)
language sql stable security definer set search_path = public as $$
  select provider, account_token from public.linked_accounts
   where user_id = p_user_id and is_default and verified_at is not null and account_token is not null;
$$;

-- ---------------------------------------------------------------- Score Communauté

-- The raw figures behind the score. The score itself is computed in
-- src/lib/score.ts (unit-tested); nothing here is shared without consent.
create function public.score_inputs(p_user_id uuid)
returns table (contributions_total int, contributions_on_time int, cycles_completed int,
               savings_weeks int, account_age_days int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from public.contributions k where k.member_id = p_user_id and k.status = 'succeeded'),
    (select count(*)::int
       from public.contributions k
       join public.cycles c on c.id = k.cycle_id
       join public.payments p on p.id = k.payment_id
      where k.member_id = p_user_id and k.status = 'succeeded' and p.created_at::date <= c.due_date),
    (select count(distinct c.id)::int
       from public.cycles c
       join public.group_members m on m.group_id = c.group_id and m.user_id = p_user_id and m.role <> 'sponsor'
      where c.status = 'paid_out'
        and exists (select 1 from public.contributions k where k.cycle_id = c.id and k.member_id = p_user_id and k.status = 'succeeded')),
    -- Distinct weeks, out of the last 12, with a successful savings deposit.
    (select count(distinct date_trunc('week', p.created_at))::int
       from public.payments p
       join public.savings_goals g on g.id = p.purpose_id and g.user_id = p_user_id
      where p.purpose_type = 'savings_topup' and p.status = 'succeeded' and p.created_at >= now() - interval '12 weeks'),
    (select greatest(0, current_date - created_at::date)::int from public.profiles where id = p_user_id);
$$;

create function public.my_score_inputs()
returns table (contributions_total int, contributions_on_time int, cycles_completed int,
               savings_weeks int, account_age_days int)
language sql stable security definer set search_path = public as $$
  select * from public.score_inputs(auth.uid());
$$;

-- One active consent per purpose; revoking sets revoked_at (history is kept).
create unique index consents_one_active on public.consents (user_id, purpose) where revoked_at is null;

create function public.has_active_consent(p_purpose text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.consents where user_id = auth.uid() and purpose = p_purpose and revoked_at is null);
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function public.check_goal_payment, public.goals_due_topup, public.advance_goal_topup, public.score_inputs, public.default_payment_account
  from public, anon, authenticated;
grant execute on function public.check_goal_payment, public.goals_due_topup, public.advance_goal_topup, public.score_inputs, public.default_payment_account
  to service_role;
revoke execute on function public.my_goals, public.my_score_inputs, public.has_active_consent from public, anon;
grant execute on function public.my_goals, public.my_score_inputs, public.has_active_consent to authenticated, service_role;
revoke execute on function public.create_payment from public, anon, authenticated;
grant execute on function public.create_payment to service_role;
