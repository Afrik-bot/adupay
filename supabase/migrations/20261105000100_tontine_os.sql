-- Phase 6: Tontine OS for members. Creating and joining groups, starting the
-- rotation, paying a share, the shared group ledger, and voted rule changes.
-- Money still moves only through create_payment / settle_payment.

-- ---------------------------------------------------------------- accounts

-- Provider token for a verified linked account; payments use it instead of the
-- account number, which AduPay never stores. Set by the server only.
alter table public.linked_accounts add column account_token text;

-- ---------------------------------------------------------------- helpers

create function public.cycle_interval(p_frequency public.group_frequency) returns interval
language sql immutable as $$
  select case p_frequency when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days' else interval '1 month' end;
$$;

-- People who take a turn (sponsors pay for someone else and have no turn).
create function public.group_rotation_size(p_group_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.group_members where group_id = p_group_id and role <> 'sponsor';
$$;

create function public.current_cycle(p_group_id uuid) returns public.cycles
language sql stable security definer set search_path = public as $$
  select * from public.cycles
   where group_id = p_group_id and status in ('open', 'collecting')
   order by number desc limit 1;
$$;

-- ---------------------------------------------------------------- create / join / start

create function public.create_group(
  p_name text,
  p_contribution_amount bigint,
  p_frequency public.group_frequency,
  p_start_date date,
  p_member_limit int,
  p_payout_order public.payout_order,
  p_grace_days int,
  p_late_penalty_amount bigint
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if p_contribution_amount < 500 or p_contribution_amount > 2000000 then
    raise exception 'contribution must be between 500 and 2 000 000 FCFA' using errcode = '22023';
  end if;
  if p_start_date < current_date then
    raise exception 'start date cannot be in the past' using errcode = '22023';
  end if;
  if p_late_penalty_amount < 0 or p_late_penalty_amount > p_contribution_amount then
    raise exception 'late penalty must be between 0 and the contribution' using errcode = '22023';
  end if;

  insert into public.groups (name, manager_id, contribution_amount, frequency, start_date, member_limit, payout_order)
  values (trim(p_name), auth.uid(), p_contribution_amount, p_frequency, p_start_date, p_member_limit, p_payout_order)
  returning id into v_id;
  insert into public.group_rules (group_id, grace_days, late_penalty_amount)
  values (v_id, p_grace_days, p_late_penalty_amount);
  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'manager');
  return v_id;
end;
$$;

-- What someone sees on an invite link before joining.
create function public.group_invite_preview(p_invite_code text)
returns table (
  group_id uuid, name text, contribution_amount bigint, currency public.currency_code,
  frequency public.group_frequency, start_date date, payout_order public.payout_order,
  status public.group_status, member_count int, member_limit int, manager_name text, already_member boolean
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.contribution_amount, g.currency, g.frequency, g.start_date, g.payout_order, g.status,
         public.group_rotation_size(g.id), g.member_limit, p.full_name,
         exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid())
    from public.groups g
    join public.profiles p on p.id = g.manager_id
   where g.invite_code = lower(trim(p_invite_code)) and auth.uid() is not null;
$$;

create function public.join_group(p_invite_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into v_group from public.groups where invite_code = lower(trim(p_invite_code)) for update;
  if not found then
    raise exception 'invite_not_found' using errcode = '22023';
  end if;
  if exists (select 1 from public.group_members where group_id = v_group.id and user_id = auth.uid()) then
    return v_group.id; -- opening the link twice is fine
  end if;
  if v_group.status <> 'draft' then
    raise exception 'group_started: this tontine has already started' using errcode = '22023';
  end if;
  if public.group_rotation_size(v_group.id) >= v_group.member_limit then
    raise exception 'group_full' using errcode = '22023';
  end if;
  insert into public.group_members (group_id, user_id, role) values (v_group.id, auth.uid(), 'member');
  return v_group.id;
end;
$$;

-- Manager starts the rotation: fixes the payout order and opens round 1.
create function public.start_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_group public.groups;
  v_start date;
begin
  select * into v_group from public.groups where id = p_group_id for update;
  if not found or v_group.manager_id <> auth.uid() then
    raise exception 'only the manager can start the tontine' using errcode = '42501';
  end if;
  if v_group.status <> 'draft' then
    raise exception 'group_started' using errcode = '22023';
  end if;
  if public.group_rotation_size(p_group_id) < 2 then
    raise exception 'not_enough_members: at least 2 members are needed' using errcode = '22023';
  end if;

  with ordered as (
    select user_id,
           row_number() over (
             order by case when v_group.payout_order = 'lottery' then random() end, joined_at, user_id
           ) as position
      from public.group_members
     where group_id = p_group_id and role <> 'sponsor'
  )
  update public.group_members m set payout_position = o.position
    from ordered o
   where m.group_id = p_group_id and m.user_id = o.user_id;

  v_start := greatest(v_group.start_date, current_date);
  update public.groups set status = 'active', start_date = v_start where id = p_group_id;
  insert into public.cycles (group_id, number, due_date, recipient_id, status)
  select p_group_id, 1, v_start, user_id, 'collecting'
    from public.group_members where group_id = p_group_id and payout_position = 1;
end;
$$;

-- ---------------------------------------------------------------- reading a group

create function public.my_groups()
returns table (
  group_id uuid, name text, contribution_amount bigint, currency public.currency_code,
  frequency public.group_frequency, status public.group_status, my_role public.member_role,
  my_position int, member_count int, current_cycle int, next_due_date date
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.contribution_amount, g.currency, g.frequency, g.status, m.role, m.payout_position,
         public.group_rotation_size(g.id), c.number, coalesce(c.due_date, g.start_date)
    from public.group_members m
    join public.groups g on g.id = m.group_id
    left join lateral (select * from public.current_cycle(g.id)) c on c.id is not null
   where m.user_id = auth.uid() and g.status <> 'cancelled'
   order by (g.status = 'completed'), coalesce(c.due_date, g.start_date), g.name;
$$;

create function public.group_members_status(p_group_id uuid)
returns table (
  user_id uuid, full_name text, role public.member_role, payout_position int,
  sponsored_member_id uuid, paid_current boolean, is_recipient boolean, is_me boolean
)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.full_name, m.role, m.payout_position, m.sponsored_member_id,
         exists (
           select 1 from public.contributions k
            where k.cycle_id = c.id and k.member_id = m.user_id and k.status = 'succeeded'
         ),
         c.recipient_id = m.user_id,
         m.user_id = auth.uid()
    from public.group_members m
    join public.profiles p on p.id = m.user_id
    left join lateral (select * from public.current_cycle(p_group_id)) c on c.id is not null
   where m.group_id = p_group_id and public.is_group_member(p_group_id)
   order by m.payout_position nulls last, m.joined_at;
$$;

-- FR-2: the shared ledger every member sees: who, what, when, rail reference.
create function public.group_ledger(p_group_id uuid, p_limit int default 50)
returns table (
  entry_id bigint, created_at timestamptz, kind text, side public.ledger_side, amount bigint,
  currency public.currency_code, member_name text, cycle_number int, rail_reference text
)
language sql stable security definer set search_path = public as $$
  select e.id, e.created_at, t.kind, e.side, e.amount, e.currency, p.full_name, c.number, pay.provider_ref
    from public.ledger_accounts a
    join public.ledger_entries e on e.account_id = a.id
    join public.ledger_transactions t on t.id = e.transaction_id
    left join public.payments pay on pay.id = t.payment_id
    left join public.contributions k on k.id = pay.purpose_id and pay.purpose_type = 'contribution'
    left join public.cycles c on c.id = k.cycle_id
    left join public.profiles p on p.id = coalesce(k.member_id, pay.user_id)
   where a.owner_type = 'group' and a.owner_id = p_group_id and public.is_group_member(p_group_id)
   order by e.id desc
   limit least(p_limit, 200);
$$;

-- ---------------------------------------------------------------- paying a share

-- Server only. Returns the open contribution for this member and round, creating
-- it if needed; refuses if the share is already paid.
create function public.create_contribution(p_cycle_id uuid, p_member_id uuid, p_paid_by uuid)
returns public.contributions
language plpgsql security definer set search_path = public as $$
declare
  v_cycle public.cycles;
  v_group public.groups;
  v_row public.contributions;
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

  perform 1 from public.cycles where id = p_cycle_id for update; -- one creator at a time per round
  if exists (select 1 from public.contributions where cycle_id = p_cycle_id and member_id = p_member_id and status = 'succeeded') then
    raise exception 'already_paid' using errcode = '22023';
  end if;
  select * into v_row from public.contributions
   where cycle_id = p_cycle_id and member_id = p_member_id and status = 'pending'
   order by created_at desc limit 1;
  if found then
    return v_row;
  end if;
  insert into public.contributions (cycle_id, member_id, paid_by, amount, currency)
  values (p_cycle_id, p_member_id, p_paid_by, v_group.contribution_amount, v_group.currency)
  returning * into v_row;
  return v_row;
end;
$$;

-- A contribution follows its payment: linked when created, status when settled.
create function public.sync_contribution_from_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.purpose_type = 'contribution' and new.purpose_id is not null then
    update public.contributions
       set payment_id = new.id, status = new.status
     where id = new.purpose_id and (payment_id is distinct from new.id or status is distinct from new.status);
  end if;
  return null;
end;
$$;
create trigger payments_sync_contribution
  after insert or update of status on public.payments
  for each row execute function public.sync_contribution_from_payment();

-- ---------------------------------------------------------------- rules and votes

create table public.group_rule_proposals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  proposed_by uuid not null references public.profiles (id),
  grace_days int not null check (grace_days between 0 and 30),
  late_penalty_amount bigint not null check (late_penalty_amount >= 0),
  status text not null default 'open' check (status in ('open', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index group_rule_proposals_one_open on public.group_rule_proposals (group_id) where status = 'open';

create table public.group_rule_votes (
  proposal_id uuid not null references public.group_rule_proposals (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  approve boolean not null,
  created_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

alter table public.group_rule_proposals enable row level security;
alter table public.group_rule_votes enable row level security;
revoke all on public.group_rule_proposals, public.group_rule_votes from anon;
revoke insert, update, delete, truncate on public.group_rule_proposals, public.group_rule_votes from authenticated;
grant select on public.group_rule_proposals, public.group_rule_votes to authenticated;
grant all on public.group_rule_proposals, public.group_rule_votes to service_role;
create policy rule_proposals_select on public.group_rule_proposals for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());
create policy rule_votes_select on public.group_rule_votes for select to authenticated
  using (exists (select 1 from public.group_rule_proposals p where p.id = proposal_id and public.is_group_member(p.group_id)));

-- Decides an open proposal once a majority of the rotation has voted one way.
create function public.settle_rule_proposal(p_proposal_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_proposal public.group_rule_proposals;
  v_voters int;
  v_yes int;
  v_no int;
begin
  select * into v_proposal from public.group_rule_proposals where id = p_proposal_id for update;
  v_voters := public.group_rotation_size(v_proposal.group_id);
  select count(*) filter (where approve), count(*) filter (where not approve) into v_yes, v_no
    from public.group_rule_votes v
    join public.group_members m on m.group_id = v_proposal.group_id and m.user_id = v.user_id and m.role <> 'sponsor'
   where v.proposal_id = p_proposal_id;

  if v_yes * 2 > v_voters then
    update public.group_rules
       set grace_days = v_proposal.grace_days, late_penalty_amount = v_proposal.late_penalty_amount,
           version = version + 1, updated_at = now()
     where group_id = v_proposal.group_id;
    update public.group_rule_proposals set status = 'approved', decided_at = now() where id = p_proposal_id;
    return 'approved';
  elsif v_no * 2 >= v_voters then
    update public.group_rule_proposals set status = 'rejected', decided_at = now() where id = p_proposal_id;
    return 'rejected';
  end if;
  return 'open';
end;
$$;

-- Before the tontine starts the manager edits rules directly; afterwards any
-- member may propose a change, which needs a majority vote (FR-3).
create function public.propose_group_rules(p_group_id uuid, p_grace_days int, p_late_penalty_amount bigint)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_group public.groups;
  v_proposal uuid;
begin
  select * into v_group from public.groups where id = p_group_id;
  if not found or not exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid() and role <> 'sponsor'
  ) then
    raise exception 'only members can change the rules' using errcode = '42501';
  end if;
  if p_late_penalty_amount > v_group.contribution_amount then
    raise exception 'late penalty must be between 0 and the contribution' using errcode = '22023';
  end if;

  if v_group.status = 'draft' then
    if v_group.manager_id <> auth.uid() then
      raise exception 'only the manager edits rules before the start' using errcode = '42501';
    end if;
    update public.group_rules
       set grace_days = p_grace_days, late_penalty_amount = p_late_penalty_amount, version = version + 1, updated_at = now()
     where group_id = p_group_id;
    return 'applied';
  end if;

  if exists (select 1 from public.group_rule_proposals where group_id = p_group_id and status = 'open') then
    raise exception 'proposal_open: a rule change is already being voted on' using errcode = '22023';
  end if;
  insert into public.group_rule_proposals (group_id, proposed_by, grace_days, late_penalty_amount)
  values (p_group_id, auth.uid(), p_grace_days, p_late_penalty_amount)
  returning id into v_proposal;
  insert into public.group_rule_votes (proposal_id, user_id, approve) values (v_proposal, auth.uid(), true);
  return public.settle_rule_proposal(v_proposal);
end;
$$;

create function public.vote_group_rules(p_proposal_id uuid, p_approve boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_proposal public.group_rule_proposals;
begin
  select * into v_proposal from public.group_rule_proposals where id = p_proposal_id;
  if not found or not exists (
    select 1 from public.group_members where group_id = v_proposal.group_id and user_id = auth.uid() and role <> 'sponsor'
  ) then
    raise exception 'only members can vote' using errcode = '42501';
  end if;
  if v_proposal.status <> 'open' then
    raise exception 'proposal_closed' using errcode = '22023';
  end if;
  insert into public.group_rule_votes (proposal_id, user_id, approve) values (p_proposal_id, auth.uid(), p_approve)
  on conflict (proposal_id, user_id) do update set approve = excluded.approve, created_at = now();
  return public.settle_rule_proposal(p_proposal_id);
end;
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function
  public.cycle_interval, public.group_rotation_size, public.current_cycle, public.create_group,
  public.group_invite_preview, public.join_group, public.start_group, public.my_groups,
  public.group_members_status, public.group_ledger, public.create_contribution,
  public.sync_contribution_from_payment, public.settle_rule_proposal, public.propose_group_rules,
  public.vote_group_rules
  from public, anon;
grant execute on function
  public.create_group, public.group_invite_preview, public.join_group, public.start_group, public.my_groups,
  public.group_members_status, public.group_ledger, public.propose_group_rules, public.vote_group_rules
  to authenticated, service_role;
revoke execute on function
  public.group_rotation_size, public.current_cycle, public.create_contribution,
  public.sync_contribution_from_payment, public.settle_rule_proposal
  from authenticated;
grant execute on function
  public.cycle_interval, public.group_rotation_size, public.current_cycle, public.create_contribution,
  public.settle_rule_proposal
  to service_role;
