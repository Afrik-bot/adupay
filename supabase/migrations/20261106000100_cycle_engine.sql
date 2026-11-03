-- Phase 7: the tontine cycle engine and the manager's tools.
-- A daily job walks each active group's current round:
--   reminders before and after the due date  ->  penalties proposed after the
--   grace period  ->  payout when everyone has paid or the grace period ends
--   ->  manager commission  ->  next round (or the group completes).
-- Every step is keyed so a re-run changes nothing.

-- ---------------------------------------------------------------- schema

alter table public.notifications add column dedupe_key text;
create unique index notifications_dedupe on public.notifications (dedupe_key) where dedupe_key is not null;

alter table public.payouts add column attempts int not null default 1;
alter table public.payouts add column updated_at timestamptz not null default now();
create trigger payouts_touch before update on public.payouts for each row execute function public.touch_updated_at();

create table public.contribution_penalties (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  member_id uuid not null references public.profiles (id),
  amount bigint not null check (amount > 0),
  currency public.currency_code not null,
  -- proposed by the engine; the manager confirms or waives; charged once paid
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'waived', 'charged')),
  charged_contribution_id uuid references public.contributions (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cycle_id, member_id)
);
alter table public.contribution_penalties enable row level security;
revoke all on public.contribution_penalties from anon;
revoke insert, update, delete, truncate on public.contribution_penalties from authenticated;
grant select on public.contribution_penalties to authenticated;
grant all on public.contribution_penalties to service_role;
create policy penalties_select on public.contribution_penalties for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());

-- AduPay pays manager commissions from its own funds: an expense account that
-- grows (debit-normal) with every commission.
insert into public.ledger_accounts (code, owner_type, currency, normal_side, allow_negative)
select 'system:manager_commissions:' || cur, 'system', cur::public.currency_code, 'debit', true
  from unnest(array['XOF', 'EUR', 'USD', 'CAD']) as cur;

-- 0.5 %, rounded half up, as in applyBps().
create function public.manager_commission(p_amount bigint) returns bigint
language sql immutable as $$
  select (p_amount * 50 * 2 + 10000) / 20000;
$$;

-- ---------------------------------------------------------------- penalties in contributions

-- A member's share now includes any confirmed penalty not yet charged.
create or replace function public.create_contribution(p_cycle_id uuid, p_member_id uuid, p_paid_by uuid)
returns public.contributions
language plpgsql security definer set search_path = public as $$
declare
  v_cycle public.cycles;
  v_group public.groups;
  v_row public.contributions;
  v_penalties bigint;
begin
  select * into v_cycle from public.cycles where id = p_cycle_id;
  if not found or v_cycle.status not in ('open', 'collecting') then
    raise exception 'cycle_closed' using errcode = '22023';
  end if;
  select * into v_group from public.groups where id = v_cycle.group_id;
  if not exists (
    select 1 from public.group_members
     where group_id = v_group.id and user_id = p_member_id and role <> 'sponsor'
  ) then
    raise exception 'not a member of this tontine' using errcode = '42501';
  end if;
  if p_paid_by <> p_member_id and not exists (
    select 1 from public.group_members
     where group_id = v_group.id and user_id = p_paid_by and role = 'sponsor' and sponsored_member_id = p_member_id
  ) then
    raise exception 'only the member or their sponsor can pay this share' using errcode = '42501';
  end if;

  perform 1 from public.cycles where id = p_cycle_id for update;
  if exists (select 1 from public.contributions where cycle_id = p_cycle_id and member_id = p_member_id and status = 'succeeded') then
    raise exception 'already_paid' using errcode = '22023';
  end if;
  select * into v_row from public.contributions
   where cycle_id = p_cycle_id and member_id = p_member_id and status = 'pending'
   order by created_at desc limit 1;
  if found then
    return v_row;
  end if;

  select coalesce(sum(amount), 0) into v_penalties
    from public.contribution_penalties
   where group_id = v_group.id and member_id = p_member_id and status = 'confirmed' and charged_contribution_id is null;

  insert into public.contributions (cycle_id, member_id, paid_by, amount, currency)
  values (p_cycle_id, p_member_id, p_paid_by, v_group.contribution_amount + v_penalties, v_group.currency)
  returning * into v_row;

  update public.contribution_penalties set charged_contribution_id = v_row.id
   where group_id = v_group.id and member_id = p_member_id and status = 'confirmed' and charged_contribution_id is null;
  return v_row;
end;
$$;

-- When a contribution settles, its penalties are charged (or released to retry).
create function public.sync_penalties_from_contribution() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'succeeded' then
    update public.contribution_penalties set status = 'charged' where charged_contribution_id = new.id;
  elsif new.status = 'failed' then
    update public.contribution_penalties set charged_contribution_id = null where charged_contribution_id = new.id;
  end if;
  return null;
end;
$$;
create trigger contributions_sync_penalties
  after update of status on public.contributions
  for each row when (new.status is distinct from old.status)
  execute function public.sync_penalties_from_contribution();

-- A payout follows its payment's status, like contributions do.
create function public.sync_payout_from_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.purpose_type = 'tontine_payout' and new.purpose_id is not null then
    update public.payouts set status = new.status
     where cycle_id = new.purpose_id and payment_id = new.id and status is distinct from new.status;
  end if;
  return null;
end;
$$;
create trigger payments_sync_payout
  after update of status on public.payments
  for each row execute function public.sync_payout_from_payment();

-- ---------------------------------------------------------------- the engine (server only)

create function public.cycle_collected(p_cycle_id uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::bigint from public.contributions where cycle_id = p_cycle_id and status = 'succeeded';
$$;

-- Who still owes a share this round: one row per person to notify, i.e. each
-- unpaid member, plus their sponsor if someone pays on their behalf.
create function public.cycle_unpaid(p_cycle_id uuid) returns table (notify_id uuid, member_id uuid)
language sql stable security definer set search_path = public as $$
  with unpaid as (
    select m.group_id, m.user_id
      from public.cycles c
      join public.group_members m on m.group_id = c.group_id and m.role <> 'sponsor'
     where c.id = p_cycle_id
       and not exists (select 1 from public.contributions k where k.cycle_id = c.id and k.member_id = m.user_id and k.status = 'succeeded')
  )
  select u.user_id, u.user_id from unpaid u
  union
  select s.user_id, u.user_id
    from unpaid u
    join public.group_members s on s.group_id = u.group_id and s.role = 'sponsor' and s.sponsored_member_id = u.user_id;
$$;

create function public.engine_cycles() returns setof public.cycles
language sql stable security definer set search_path = public as $$
  select c.* from public.groups g
    join lateral (select * from public.current_cycle(g.id)) c on c.id is not null
   where g.status = 'active'
   order by c.due_date, c.id;
$$;

-- One round's housekeeping for the given day. Sends reminders and proposes
-- penalties itself; returns what the runner must do next:
--   wait | close_empty | blocked (recipient has no payout account) | payout | done
create function public.cycle_step(p_cycle_id uuid, p_today date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cycle public.cycles;
  v_group public.groups;
  v_rules public.group_rules;
  v_rotation int;
  v_paid int;
  v_grace_end date;
  v_amount bigint;
  v_account public.linked_accounts;
begin
  select * into v_cycle from public.cycles where id = p_cycle_id;
  if not found or v_cycle.status not in ('open', 'collecting') then
    return jsonb_build_object('action', 'done');
  end if;
  select * into v_group from public.groups where id = v_cycle.group_id;
  select * into v_rules from public.group_rules where group_id = v_group.id;
  v_rotation := public.group_rotation_size(v_group.id);
  v_grace_end := v_cycle.due_date + v_rules.grace_days;

  if p_today >= v_cycle.due_date - 1 then
    insert into public.notifications (user_id, channel, template, payload, dedupe_key)
    select u.notify_id, 'whatsapp', 'contribution_due',
           jsonb_build_object('group_id', v_group.id, 'group_name', v_group.name, 'cycle', v_cycle.number,
                              'amount', v_group.contribution_amount, 'currency', v_group.currency, 'due_date', v_cycle.due_date),
           'due:' || v_cycle.id || ':' || u.notify_id
      from public.cycle_unpaid(v_cycle.id) u
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if p_today > v_cycle.due_date then
    insert into public.notifications (user_id, channel, template, payload, dedupe_key)
    select u.notify_id, 'whatsapp', 'contribution_late',
           jsonb_build_object('group_id', v_group.id, 'group_name', v_group.name, 'cycle', v_cycle.number,
                              'grace_until', v_grace_end),
           'late:' || v_cycle.id || ':' || u.notify_id
      from public.cycle_unpaid(v_cycle.id) u
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  if p_today > v_grace_end and v_rules.late_penalty_amount > 0 then
    insert into public.contribution_penalties (group_id, cycle_id, member_id, amount, currency)
    select distinct v_group.id, v_cycle.id, u.member_id, v_rules.late_penalty_amount, v_group.currency
      from public.cycle_unpaid(v_cycle.id) u
    on conflict (cycle_id, member_id) do nothing;
  end if;

  select count(distinct member_id) into v_paid
    from public.contributions where cycle_id = v_cycle.id and status = 'succeeded';
  if v_paid < v_rotation and p_today <= v_grace_end then
    return jsonb_build_object('action', 'wait', 'paid', v_paid, 'rotation', v_rotation);
  end if;

  v_amount := public.cycle_collected(v_cycle.id);
  if v_amount = 0 then
    return jsonb_build_object('action', 'close_empty');
  end if;

  select * into v_account from public.linked_accounts
   where user_id = v_cycle.recipient_id and is_default and verified_at is not null and account_token is not null;
  if not found then
    insert into public.notifications (user_id, channel, template, payload, dedupe_key)
    values (v_cycle.recipient_id, 'whatsapp', 'payout_needs_account',
            jsonb_build_object('group_id', v_group.id, 'group_name', v_group.name, 'cycle', v_cycle.number, 'amount', v_amount),
            'payout-account:' || v_cycle.id)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    return jsonb_build_object('action', 'blocked', 'reason', 'no_payout_account');
  end if;

  return jsonb_build_object(
    'action', 'payout',
    'amount', v_amount,
    'currency', v_group.currency,
    'recipient_id', v_cycle.recipient_id,
    'pot_account_id', public.ensure_ledger_account('group', v_group.id, v_group.currency),
    'account_provider', v_account.provider,
    'account_token', v_account.account_token
  );
end;
$$;

-- Closes a round after its payout was sent (or with nothing to pay out), pays the
-- manager's commission, and opens the next round or completes the group.
create function public.finalize_cycle(p_cycle_id uuid, p_payment_id uuid, p_amount bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_cycle public.cycles;
  v_group public.groups;
  v_commission bigint;
  v_next_recipient uuid;
begin
  select * into v_cycle from public.cycles where id = p_cycle_id for update;
  if not found then
    raise exception 'unknown cycle %', p_cycle_id using errcode = '22023';
  end if;
  if v_cycle.status not in ('open', 'collecting') then
    return 'already_finalized';
  end if;
  select * into v_group from public.groups where id = v_cycle.group_id for update;

  if p_payment_id is not null then
    insert into public.payouts (cycle_id, recipient_id, amount, currency, payment_id, status)
    select v_cycle.id, v_cycle.recipient_id, p_amount, v_group.currency, p_payment_id, status
      from public.payments where id = p_payment_id
    on conflict (cycle_id) do nothing;

    v_commission := public.manager_commission(p_amount);
    if v_commission > 0 then
      perform public.post_ledger_transaction('commission:' || v_cycle.id, 'manager_commission',
        jsonb_build_array(
          jsonb_build_object('account_id', public.system_account('manager_commissions', v_group.currency), 'side', 'debit', 'amount', v_commission),
          jsonb_build_object('account_id', public.ensure_ledger_account('user', v_group.manager_id, v_group.currency), 'side', 'credit', 'amount', v_commission)),
        'Commission gestionnaire ' || v_group.name || ' tour ' || v_cycle.number);
    end if;

    insert into public.notifications (user_id, channel, template, payload, dedupe_key)
    values (v_cycle.recipient_id, 'whatsapp', 'pot_paid_out',
            jsonb_build_object('group_id', v_group.id, 'group_name', v_group.name, 'cycle', v_cycle.number,
                               'amount', p_amount, 'currency', v_group.currency),
            'paid-out:' || v_cycle.id)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    update public.cycles set status = 'paid_out' where id = v_cycle.id;
  else
    update public.cycles set status = 'closed' where id = v_cycle.id;
  end if;

  if v_cycle.number >= public.group_rotation_size(v_group.id) then
    update public.groups set status = 'completed' where id = v_group.id;
    return 'completed';
  end if;

  select user_id into v_next_recipient from public.group_members
   where group_id = v_group.id and payout_position = v_cycle.number + 1;
  insert into public.cycles (group_id, number, due_date, recipient_id, status)
  values (v_group.id, v_cycle.number + 1, (v_cycle.due_date + public.cycle_interval(v_group.frequency))::date, v_next_recipient, 'collecting')
  on conflict (group_id, number) do nothing;
  return 'next_cycle';
end;
$$;

-- Payouts whose rail payment failed and can be tried again (3 attempts max).
create function public.payouts_to_retry()
returns table (payout_id uuid, cycle_id uuid, recipient_id uuid, amount bigint, currency public.currency_code,
               attempts int, pot_account_id uuid, account_provider public.wallet_provider, account_token text)
language sql stable security definer set search_path = public as $$
  select p.id, p.cycle_id, p.recipient_id, p.amount, p.currency, p.attempts,
         (select a.id from public.ledger_accounts a where a.owner_type = 'group' and a.owner_id = c.group_id and a.currency = p.currency),
         la.provider, la.account_token
    from public.payouts p
    join public.cycles c on c.id = p.cycle_id
    left join public.linked_accounts la on la.user_id = p.recipient_id and la.is_default and la.account_token is not null
   where p.status = 'failed' and p.attempts < 3;
$$;

create function public.record_payout_retry(p_payout_id uuid, p_payment_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.payouts p
     set payment_id = p_payment_id, attempts = attempts + 1,
         status = (select status from public.payments where id = p_payment_id)
   where p.id = p_payout_id and p.payment_id is distinct from p_payment_id;
$$;

-- ---------------------------------------------------------------- manager tools

create function public.require_group_manager(p_group_id uuid) returns public.groups
language plpgsql stable security definer set search_path = public as $$
declare
  v_group public.groups;
begin
  select * into v_group from public.groups where id = p_group_id;
  if not found or v_group.manager_id <> auth.uid() then
    raise exception 'only the manager can do this' using errcode = '42501';
  end if;
  return v_group;
end;
$$;

create function public.manager_groups()
returns table (
  group_id uuid, name text, status public.group_status, contribution_amount bigint, currency public.currency_code,
  rotation int, current_cycle int, current_due date, paid_current int, cycles_done int,
  collection_rate numeric, late_count int, proposed_penalties int, commission_earned bigint, certified boolean
)
language sql stable security definer set search_path = public as $$
  with mine as (select * from public.groups where manager_id = auth.uid() and status <> 'cancelled'),
  stats as (
    select g.id,
           public.group_rotation_size(g.id) as rotation,
           (select count(*) from public.cycles c where c.group_id = g.id)::int as cycles_started,
           (select count(*) from public.cycles c where c.group_id = g.id and c.status in ('paid_out', 'closed'))::int as cycles_done,
           (select count(*) from public.contributions k join public.cycles c on c.id = k.cycle_id
             where c.group_id = g.id and k.status = 'succeeded')::int as paid_total,
           (select count(*) from public.payouts p join public.cycles c on c.id = p.cycle_id
             where c.group_id = g.id and p.status = 'succeeded')::int as payouts_ok
      from mine g
  )
  select g.id, g.name, g.status, g.contribution_amount, g.currency, s.rotation,
         cur.number, cur.due_date,
         coalesce((select count(distinct k.member_id) from public.contributions k where k.cycle_id = cur.id and k.status = 'succeeded'), 0)::int,
         s.cycles_done,
         case when s.cycles_started = 0 then null
              else round(100.0 * s.paid_total / (s.rotation * s.cycles_started), 1) end,
         coalesce((select count(*) from public.group_members m
                    where m.group_id = g.id and m.role <> 'sponsor' and cur.id is not null and cur.due_date < current_date
                      and not exists (select 1 from public.contributions k where k.cycle_id = cur.id and k.member_id = m.user_id and k.status = 'succeeded')), 0)::int,
         (select count(*) from public.contribution_penalties pe where pe.group_id = g.id and pe.status = 'proposed')::int,
         coalesce((select sum(e.amount) from public.ledger_entries e join public.ledger_transactions t on t.id = e.transaction_id
                    join public.cycles c on t.idempotency_key = 'commission:' || c.id
                   where c.group_id = g.id and e.side = 'credit'), 0)::bigint,
         s.payouts_ok >= 3 and not exists (
           select 1 from public.risk_events r where r.kind like 'dispute%' and r.details ->> 'group_id' = g.id::text)
    from mine g
    join stats s on s.id = g.id
    left join lateral (select * from public.current_cycle(g.id)) cur on cur.id is not null
   order by g.status = 'completed', g.name;
$$;

-- Members who have not paid the current round, with reminder and penalty state.
create function public.group_unpaid_members(p_group_id uuid)
returns table (member_id uuid, full_name text, cycle_number int, due_date date, days_late int,
               last_reminder_at timestamptz, penalty_id uuid, penalty_amount bigint, penalty_status text)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.full_name, c.number, c.due_date, greatest(0, current_date - c.due_date),
         (select max(n.created_at) from public.notifications n
           where n.user_id = m.user_id and n.payload ->> 'group_id' = p_group_id::text
             and n.template in ('contribution_due', 'contribution_late', 'manual_reminder')),
         pe.id, pe.amount, pe.status
    from public.groups g
    join lateral (select * from public.current_cycle(g.id)) c on c.id is not null
    join public.group_members m on m.group_id = g.id and m.role <> 'sponsor'
    join public.profiles p on p.id = m.user_id
    left join public.contribution_penalties pe on pe.member_id = m.user_id and pe.group_id = g.id and pe.status in ('proposed', 'confirmed')
   where g.id = p_group_id and g.manager_id = auth.uid()
     and not exists (select 1 from public.contributions k where k.cycle_id = c.id and k.member_id = m.user_id and k.status = 'succeeded')
   order by p.full_name;
$$;

-- One tap: a simulated WhatsApp or SMS reminder to each unpaid member,
-- at most once per member, channel and day. Returns how many were sent.
create function public.send_group_reminders(p_group_id uuid, p_channel public.notification_channel) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_group public.groups := public.require_group_manager(p_group_id);
  v_cycle public.cycles := public.current_cycle(p_group_id);
  v_sent int;
begin
  if p_channel not in ('whatsapp', 'sms') then
    raise exception 'channel must be whatsapp or sms' using errcode = '22023';
  end if;
  if v_cycle.id is null then
    return 0;
  end if;
  insert into public.notifications (user_id, channel, template, payload, dedupe_key)
  select m.user_id, p_channel, 'manual_reminder',
         jsonb_build_object('group_id', v_group.id, 'group_name', v_group.name, 'cycle', v_cycle.number,
                            'amount', v_group.contribution_amount, 'currency', v_group.currency, 'due_date', v_cycle.due_date,
                            'sent_by', auth.uid()),
         'manual:' || v_cycle.id || ':' || m.user_id || ':' || p_channel || ':' || current_date
    from public.group_members m
   where m.group_id = p_group_id and m.role <> 'sponsor'
     and not exists (select 1 from public.contributions k where k.cycle_id = v_cycle.id and k.member_id = m.user_id and k.status = 'succeeded')
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_sent = row_count;
  return v_sent;
end;
$$;

create function public.review_penalty(p_penalty_id uuid, p_confirm boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_penalty public.contribution_penalties;
begin
  select * into v_penalty from public.contribution_penalties where id = p_penalty_id for update;
  if not found then
    raise exception 'unknown penalty' using errcode = '22023';
  end if;
  perform public.require_group_manager(v_penalty.group_id);
  if v_penalty.status <> 'proposed' then
    raise exception 'penalty_already_decided' using errcode = '22023';
  end if;
  update public.contribution_penalties
     set status = case when p_confirm then 'confirmed' else 'waived' end, decided_by = auth.uid(), decided_at = now()
   where id = p_penalty_id;
end;
$$;

-- Statement rows for CSV / PDF export, oldest first.
create function public.group_statement(p_group_id uuid)
returns table (occurred_at timestamptz, cycle_number int, entry_type text, member_name text, amount bigint,
               currency public.currency_code, status text, reference text)
language sql stable security definer set search_path = public as $$
  select * from (
    select k.created_at, c.number, 'contribution', p.full_name, k.amount, k.currency, k.status::text, pay.provider_ref
      from public.contributions k
      join public.cycles c on c.id = k.cycle_id
      join public.profiles p on p.id = k.member_id
      left join public.payments pay on pay.id = k.payment_id
     where c.group_id = p_group_id and k.status <> 'pending'
    union all
    select po.created_at, c.number, 'payout', p.full_name, po.amount, po.currency, po.status::text, pay.provider_ref
      from public.payouts po
      join public.cycles c on c.id = po.cycle_id
      join public.profiles p on p.id = po.recipient_id
      left join public.payments pay on pay.id = po.payment_id
     where c.group_id = p_group_id
    union all
    select pe.created_at, c.number, 'penalty', p.full_name, pe.amount, pe.currency, pe.status, null
      from public.contribution_penalties pe
      join public.cycles c on c.id = pe.cycle_id
      join public.profiles p on p.id = pe.member_id
     where pe.group_id = p_group_id
  ) rows
  where exists (select 1 from public.groups g where g.id = p_group_id and g.manager_id = auth.uid())
  order by 1, 2;
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function
  public.manager_commission, public.sync_penalties_from_contribution, public.sync_payout_from_payment,
  public.cycle_collected, public.cycle_unpaid, public.engine_cycles, public.cycle_step, public.finalize_cycle,
  public.payouts_to_retry, public.record_payout_retry, public.require_group_manager,
  public.manager_groups, public.group_unpaid_members, public.send_group_reminders,
  public.review_penalty, public.group_statement
  from public, anon, authenticated;
grant execute on function
  public.manager_commission, public.cycle_collected, public.cycle_unpaid, public.engine_cycles, public.cycle_step,
  public.finalize_cycle, public.payouts_to_retry, public.record_payout_retry
  to service_role;
grant execute on function
  public.manager_groups, public.group_unpaid_members, public.send_group_reminders,
  public.review_penalty, public.group_statement
  to authenticated, service_role;
