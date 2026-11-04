-- Phase 11: admin and compliance. Monitoring rules that open risk cases, a
-- sanctions-screening stub that blocks payouts, case management, transaction
-- search and KPIs. Every admin action writes to audit_log.

-- ---------------------------------------------------------------- risk cases

alter table public.risk_events
  add column assigned_to uuid references public.profiles (id),
  add column updated_at timestamptz not null default now();
create trigger risk_events_touch before update on public.risk_events for each row execute function public.touch_updated_at();
create index risk_events_open on public.risk_events (status, created_at desc);

create table public.risk_event_notes (
  id bigint generated always as identity primary key,
  risk_event_id uuid not null references public.risk_events (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  note text not null check (length(note) between 1 and 2000),
  status_change text,
  created_at timestamptz not null default now()
);
alter table public.risk_event_notes enable row level security;
revoke all on public.risk_event_notes from anon;
revoke insert, update, delete, truncate on public.risk_event_notes from authenticated;
grant select on public.risk_event_notes to authenticated;
grant all on public.risk_event_notes to service_role;
create policy risk_notes_select on public.risk_event_notes for select to authenticated
  using (public.is_admin() or public.has_role('compliance'));
create trigger risk_event_notes_append_only before update or delete on public.risk_event_notes
  for each row execute function public.forbid_mutation();

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.has_role('compliance');
$$;

-- Move a case through open -> reviewing -> closed / escalated, with a note.
create function public.update_risk_case(p_risk_event_id uuid, p_status public.risk_status, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_before public.risk_events;
begin
  if not public.is_staff() then
    raise exception 'only compliance staff can manage risk cases' using errcode = '42501';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'a note is required' using errcode = '22023';
  end if;
  select * into v_before from public.risk_events where id = p_risk_event_id for update;
  if not found then
    raise exception 'unknown risk case' using errcode = '22023';
  end if;
  update public.risk_events set status = p_status, assigned_to = coalesce(assigned_to, auth.uid()) where id = p_risk_event_id;
  insert into public.risk_event_notes (risk_event_id, author_id, note, status_change)
  values (p_risk_event_id, auth.uid(), trim(p_note),
          case when v_before.status <> p_status then v_before.status || ' -> ' || p_status end);
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'risk.update', 'risk_events', p_risk_event_id::text,
          jsonb_build_object('from', v_before.status, 'to', p_status, 'kind', v_before.kind, 'note', trim(p_note)));
end;
$$;

-- ---------------------------------------------------------------- monitoring rules

-- Rule 1: more than 5 payments by one person within an hour (once per hour).
create function public.rule_payment_velocity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  if new.user_id is null or new.direction <> 'collect' then
    return null;
  end if;
  select count(*) into v_count from public.payments
   where user_id = new.user_id and direction = 'collect' and created_at > now() - interval '1 hour';
  if v_count > 5 and not exists (
    select 1 from public.risk_events
     where kind = 'velocity_1h' and subject_user_id = new.user_id and created_at > now() - interval '1 hour'
  ) then
    insert into public.risk_events (kind, severity, subject_user_id, details)
    values ('velocity_1h', 'medium', new.user_id, jsonb_build_object('payments_last_hour', v_count, 'rule', '> 5 payments in 1 hour'));
  end if;
  return null;
end;
$$;
create trigger payments_rule_velocity after insert on public.payments for each row execute function public.rule_payment_velocity();

-- Rule 2: payments above the KYC tier limit. create_payment refuses them and the
-- refusal rolls back its transaction, so the server records the attempt here
-- afterwards (once per person per day).
create function public.record_limit_breach(p_user_id uuid, p_amount bigint, p_currency public.currency_code, p_context text)
returns void
language sql security definer set search_path = public as $$
  insert into public.risk_events (kind, severity, subject_user_id, details)
  select 'kyc_limit_exceeded', 'medium', p_user_id,
         jsonb_build_object('amount', p_amount, 'currency', p_currency, 'context', p_context,
                            'kyc_tier', (select kyc_tier from public.profiles where id = p_user_id),
                            'rule', 'payment above KYC tier limit')
   where not exists (
     select 1 from public.risk_events
      where kind = 'kyc_limit_exceeded' and subject_user_id = p_user_id and created_at::date = current_date
   );
$$;

-- Rule 3: one sender paying 3 or more payees they had never paid before, in a day.
create function public.rule_new_payees_day() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_new int;
begin
  if new.payee_id is null then
    return null;
  end if;
  select count(distinct d.payee_id) into v_new
    from public.directed_payments d
   where d.sender_id = new.sender_id and d.payee_id is not null and d.created_at::date = current_date
     and not exists (
       select 1 from public.directed_payments e
        where e.sender_id = d.sender_id and e.payee_id = d.payee_id and e.created_at::date < current_date
     );
  if v_new >= 3 and not exists (
    select 1 from public.risk_events
     where kind = 'new_payees_day' and subject_user_id = new.sender_id and created_at::date = current_date
  ) then
    insert into public.risk_events (kind, severity, subject_user_id, details)
    values ('new_payees_day', 'medium', new.sender_id, jsonb_build_object('new_payees_today', v_new, 'rule', '>= 3 new payees in a day'));
  end if;
  return null;
end;
$$;
create trigger directed_payments_rule_new_payees after insert on public.directed_payments
  for each row execute function public.rule_new_payees_day();

-- ---------------------------------------------------------------- sanctions screening (stub)

create table public.sanctions_list (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  entity_type text not null default 'person' check (entity_type in ('person', 'organisation')),
  source text not null default 'sample',
  added_at timestamptz not null default now()
);
alter table public.sanctions_list enable row level security;
revoke all on public.sanctions_list from anon;
revoke insert, update, delete, truncate on public.sanctions_list from authenticated;
grant select on public.sanctions_list to authenticated;
grant all on public.sanctions_list to service_role;
create policy sanctions_select on public.sanctions_list for select to authenticated using (public.is_staff());

-- Fictional sample entries only. A real provider (UN, EU, OFAC lists) replaces this.
insert into public.sanctions_list (full_name, entity_type) values
  ('Personne Sanctionnée Exemple', 'person'),
  ('Jean-Baptiste Listetest', 'person'),
  ('Ama Démo Interdite', 'person'),
  ('Société Écran Exemple SARL', 'organisation');

alter table public.profiles add column sanctions_status text not null default 'clear'
  check (sanctions_status in ('clear', 'hit', 'cleared'));
alter table public.payees add column sanctions_status text not null default 'clear'
  check (sanctions_status in ('clear', 'hit', 'cleared'));

create function public.normalize_name(p_name text) returns text
language sql immutable as $$
  select trim(regexp_replace(
    translate(lower(coalesce(p_name, '')), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ’''-', 'aaaaaaceeeeiiiinooooouuuuyyoe    '),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- Hit when every word of a listed name appears in the screened name, in any order.
create function public.sanctions_match(p_name text) returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from public.sanctions_list s
   where public.normalize_name(p_name) <> ''
     and string_to_array(public.normalize_name(s.full_name), ' ') <@ string_to_array(public.normalize_name(p_name), ' ')
   limit 1;
$$;

-- Before saving: set the screening status on the row itself.
create function public.screen_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.full_name is not distinct from old.full_name then
    return new;
  end if;
  new.sanctions_status := case when public.sanctions_match(new.full_name) is null then 'clear' else 'hit' end;
  return new;
end;
$$;
create trigger profiles_screen before insert or update of full_name on public.profiles
  for each row execute function public.screen_profile();

-- After saving: open the case. (Doing this before the insert would reference a
-- profile that does not exist yet and make the whole sign-up fail.)
create function public.alert_profile_sanctions() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_hit uuid := public.sanctions_match(new.full_name);
begin
  if new.sanctions_status = 'hit' and (tg_op = 'INSERT' or new.full_name is distinct from old.full_name) then
    insert into public.risk_events (kind, severity, subject_user_id, details)
    values ('sanctions_hit', 'high', new.id,
            jsonb_build_object('screened_name', new.full_name, 'list_entry', v_hit, 'subject', 'profile',
                               'list_name', (select full_name from public.sanctions_list where id = v_hit)));
  end if;
  return null;
end;
$$;
create trigger profiles_sanctions_alert after insert or update of full_name on public.profiles
  for each row execute function public.alert_profile_sanctions();

create function public.screen_payee() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_hit uuid;
begin
  if tg_op = 'UPDATE' and new.name is not distinct from old.name then
    return new;
  end if;
  v_hit := public.sanctions_match(new.name);
  if v_hit is null then
    new.sanctions_status := 'clear';
  else
    new.sanctions_status := 'hit';
    insert into public.risk_events (kind, severity, subject_user_id, details)
    values ('sanctions_hit', 'high', new.owner_id,
            jsonb_build_object('screened_name', new.name, 'list_entry', v_hit, 'subject', 'payee', 'payee_id', new.id,
                               'list_name', (select full_name from public.sanctions_list where id = v_hit)));
  end if;
  return new;
end;
$$;
create trigger payees_screen before insert or update of name on public.payees
  for each row execute function public.screen_payee();

-- Admin marks a hit as a false positive (audited); payouts can resume.
create function public.clear_sanctions_hit(p_subject text, p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can clear a sanctions hit' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  if p_subject = 'profile' then
    update public.profiles set sanctions_status = 'cleared' where id = p_id and sanctions_status = 'hit';
  elsif p_subject = 'payee' then
    update public.payees set sanctions_status = 'cleared' where id = p_id and sanctions_status = 'hit';
  else
    raise exception 'subject must be profile or payee' using errcode = '22023';
  end if;
  if not found then
    raise exception 'no sanctions hit to clear' using errcode = '22023';
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'sanctions.clear', case when p_subject = 'profile' then 'profiles' else 'payees' end, p_id::text,
          jsonb_build_object('reason', trim(p_reason)));
end;
$$;

-- Before any payout: refuse if the recipient (member or payee) is a sanctions hit.
create function public.check_payout_sanctions(p_direction public.payment_direction, p_user_id uuid, p_purpose_type text, p_purpose_id uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_direction <> 'payout' then
    return;
  end if;
  if p_user_id is not null and exists (select 1 from public.profiles where id = p_user_id and sanctions_status = 'hit') then
    raise exception 'sanctions_hold: payout blocked pending compliance review' using errcode = 'P0004';
  end if;
  if p_purpose_type = 'directed_payout' and exists (
    select 1 from public.directed_payments d join public.payees p on p.id = d.payee_id
     where d.id = p_purpose_id and p.sanctions_status = 'hit'
  ) then
    raise exception 'sanctions_hold: payout blocked pending compliance review' using errcode = 'P0004';
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
    perform public.check_payout_sanctions(p_direction, p_user_id, p_purpose_type, p_purpose_id);
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

-- ---------------------------------------------------------------- all-in cost, recorded at payment time

alter table public.directed_payments add column all_in_pct numeric(6, 3);
create function public.set_directed_all_in() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mid numeric;
begin
  select xof_per_unit into v_mid from public.fx_rates where currency = new.source_currency;
  if v_mid is not null and new.amount > 0 then
    new.all_in_pct := round((new.source_amount - new.amount * 100 / v_mid) / (new.amount * 100 / v_mid) * 100, 3);
  end if;
  return new;
end;
$$;
create trigger directed_payments_all_in before insert on public.directed_payments
  for each row execute function public.set_directed_all_in();
update public.directed_payments d
   set all_in_pct = round((d.source_amount - d.amount * 100 / r.xof_per_unit) / (d.amount * 100 / r.xof_per_unit) * 100, 3)
  from public.fx_rates r
 where r.currency = d.source_currency and d.all_in_pct is null and d.amount > 0;

-- ---------------------------------------------------------------- admin reads

create function public.admin_kpis()
returns table (active_tontines int, members_in_active int, contributions_paid int, contributions_on_time int,
               open_risk_cases int, pending_kyc int, pending_kyb int, corridors jsonb, avg_all_in_pct numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query
  select
    (select count(*)::int from public.groups where status = 'active'),
    (select count(*)::int from public.group_members m join public.groups g on g.id = m.group_id where g.status = 'active' and m.role <> 'sponsor'),
    (select count(*)::int from public.contributions where status = 'succeeded'),
    (select count(*)::int from public.contributions k join public.cycles c on c.id = k.cycle_id join public.payments p on p.id = k.payment_id
      where k.status = 'succeeded' and p.created_at::date <= c.due_date),
    (select count(*)::int from public.risk_events where status in ('open', 'reviewing', 'escalated')),
    (select count(*)::int from public.kyc_records where status = 'pending'),
    (select count(*)::int from public.payees where kyb_status = 'pending'),
    (select coalesce(jsonb_agg(jsonb_build_object('corridor', source_currency || ' → XOF', 'count', n, 'volume_xof', v) order by v desc), '[]')
       from (select source_currency, count(*)::int as n, sum(amount)::bigint as v
               from public.directed_payments where status in ('paid', 'received', 'confirmed') group by source_currency) c),
    (select round(avg(all_in_pct), 2) from public.directed_payments where status in ('paid', 'received', 'confirmed'));
end;
$$;

create function public.admin_search_payments(p_query text default null, p_status text default null, p_limit int default 50)
returns table (id uuid, created_at timestamptz, direction public.payment_direction, amount bigint, currency public.currency_code,
               status public.payment_status, purpose_type text, provider_ref text, failure_code text,
               user_id uuid, user_name text, user_phone text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query
  select p.id, p.created_at, p.direction, p.amount, p.currency, p.status, p.purpose_type, p.provider_ref, p.failure_code,
         p.user_id, pr.full_name, pr.phone
    from public.payments p
    left join public.profiles pr on pr.id = p.user_id
   where (p_status is null or p.status::text = p_status)
     and (v_q is null
          or p.id::text like v_q || '%'
          or p.provider_ref ilike '%' || v_q || '%'
          or pr.full_name ilike '%' || v_q || '%'
          or pr.phone like '%' || regexp_replace(v_q, '\D', '', 'g') || '%' and length(regexp_replace(v_q, '\D', '', 'g')) >= 4)
   order by p.created_at desc
   limit least(coalesce(p_limit, 50), 200);
end;
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function
  public.is_staff, public.update_risk_case, public.rule_payment_velocity, public.record_limit_breach,
  public.rule_new_payees_day, public.normalize_name, public.sanctions_match, public.screen_profile, public.alert_profile_sanctions, public.screen_payee,
  public.clear_sanctions_hit, public.check_payout_sanctions, public.set_directed_all_in, public.admin_kpis,
  public.admin_search_payments
  from public, anon, authenticated;
grant execute on function public.is_staff, public.update_risk_case, public.clear_sanctions_hit, public.admin_kpis,
  public.admin_search_payments to authenticated, service_role;
grant execute on function public.record_limit_breach, public.sanctions_match, public.check_payout_sanctions to service_role;
revoke execute on function public.create_payment from public, anon, authenticated;
grant execute on function public.create_payment to service_role;
