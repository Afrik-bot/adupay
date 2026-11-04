-- Security review decisions (docs/security-review.md, "Needs a human decision"), approved November 2026.
--
-- 1. Phone numbers: fellow tontine members no longer read each other's number.
--    The manager sees unpaid members' numbers (to chase payments); staff see
--    numbers through contact_phones().
-- 2. Lottery payout order: drawn with gen_random_uuid() (cryptographically
--    secure) instead of random(), and every draw is written to the audit log.
-- 3. Staff roles (admin, compliance) only count in a session that passed
--    two-factor sign-in (JWT aal = aal2). The payee role is unchanged.

-- ---------------------------------------------------------------- 1. phone numbers

revoke select on public.profiles from authenticated;
grant select (id, full_name, user_type, country_code, city, locale, kyc_tier, onboarded_at, created_at, updated_at)
  on public.profiles to authenticated;

/** Phone numbers the caller may see: their own, and anyone's for staff. */
create function public.contact_phones(p_user_ids uuid[])
returns table (user_id uuid, phone text)
language sql stable security definer set search_path = public as $$
  select p.id, p.phone
    from public.profiles p
   where p.id = any(coalesce(p_user_ids, '{}'))
     and (p.id = auth.uid() or public.is_staff());
$$;

-- The manager's unpaid list now carries each member's number.
drop function public.group_unpaid_members(uuid);
create function public.group_unpaid_members(p_group_id uuid)
returns table (member_id uuid, full_name text, phone text, cycle_number int, due_date date, days_late int,
               last_reminder_at timestamptz, penalty_id uuid, penalty_amount bigint, penalty_status text)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.full_name, p.phone, c.number, c.due_date, greatest(0, current_date - c.due_date),
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

-- ---------------------------------------------------------------- 2. lottery draw

create or replace function public.start_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_group public.groups;
  v_start date;
  v_order jsonb;
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

  -- gen_random_uuid() draws from the server's cryptographically secure generator.
  with ordered as (
    select user_id,
           row_number() over (
             order by case when v_group.payout_order = 'lottery' then gen_random_uuid() end, joined_at, user_id
           ) as position
      from public.group_members
     where group_id = p_group_id and role <> 'sponsor'
  )
  update public.group_members m set payout_position = o.position
    from ordered o
   where m.group_id = p_group_id and m.user_id = o.user_id;

  select jsonb_agg(user_id order by payout_position) into v_order
    from public.group_members where group_id = p_group_id and role <> 'sponsor';
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'tontine.draw', 'groups', p_group_id::text,
          jsonb_build_object('payout_order', v_group.payout_order,
                             'method', case when v_group.payout_order = 'lottery' then 'gen_random_uuid' else 'join_order' end,
                             'order', v_order));

  v_start := greatest(v_group.start_date, current_date);
  update public.groups set status = 'active', start_date = v_start where id = p_group_id;
  insert into public.cycles (group_id, number, due_date, recipient_id, status)
  select p_group_id, 1, v_start, user_id, 'collecting'
    from public.group_members where group_id = p_group_id and payout_position = 1;
end;
$$;

-- ---------------------------------------------------------------- 3. two-factor for staff

/** True when this request's session passed two-factor sign-in. */
create function public.mfa_verified() returns boolean
language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'aal', '') = 'aal2';
$$;

create or replace function public.has_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = p_role)
     and (p_role = 'payee' or public.mfa_verified());
$$;

/** For the admin console: 'none' (not staff), 'mfa' (staff, second factor needed) or 'ok'. */
create function public.staff_access() returns text
language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('admin', 'compliance')) then 'none'
    when not public.mfa_verified() then 'mfa'
    else 'ok'
  end;
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function public.contact_phones, public.group_unpaid_members, public.staff_access, public.mfa_verified from public, anon;
grant execute on function public.contact_phones, public.group_unpaid_members, public.staff_access to authenticated, service_role;
grant execute on function public.mfa_verified to authenticated, service_role;
