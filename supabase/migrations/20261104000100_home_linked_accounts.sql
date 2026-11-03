-- Phase 5: data for the Accueil screen and default handling for linked accounts.

-- Tontine contributions the signed-in user owes in each group's current cycle,
-- including those a diaspora sponsor pays for the member they sponsor.
create function public.my_upcoming_dues()
returns table (
  group_id uuid,
  group_name text,
  cycle_id uuid,
  cycle_number int,
  due_date date,
  amount bigint,
  currency public.currency_code,
  member_id uuid,
  paid boolean
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, c.id, c.number, c.due_date, g.contribution_amount, g.currency,
         coalesce(m.sponsored_member_id, m.user_id) as member_id,
         exists (
           select 1 from public.contributions k
            where k.cycle_id = c.id
              and k.member_id = coalesce(m.sponsored_member_id, m.user_id)
              and k.status = 'succeeded'
         ) as paid
    from public.group_members m
    join public.groups g on g.id = m.group_id and g.status = 'active'
    join lateral (
      select * from public.cycles
       where cycles.group_id = g.id and cycles.status in ('open', 'collecting')
       order by number desc
       limit 1
    ) c on true
   where m.user_id = auth.uid()
     and (m.role <> 'sponsor' or m.sponsored_member_id is not null)
   order by c.due_date, g.name;
$$;

-- Makes one of the caller's linked accounts the default (only one may be).
create function public.set_default_linked_account(p_account_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.linked_accounts where id = p_account_id and user_id = auth.uid()) then
    raise exception 'linked account not found' using errcode = '22023';
  end if;
  update public.linked_accounts set is_default = false where user_id = auth.uid() and is_default and id <> p_account_id;
  update public.linked_accounts set is_default = true where id = p_account_id;
end;
$$;

-- Removing the default promotes the most recent remaining account.
create function public.promote_default_linked_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.is_default then
    update public.linked_accounts set is_default = true
     where id = (select id from public.linked_accounts where user_id = old.user_id order by created_at desc limit 1);
  end if;
  return old;
end;
$$;
create trigger linked_accounts_promote_default
  after delete on public.linked_accounts
  for each row execute function public.promote_default_linked_account();

-- Users may no longer flip is_default directly (it could break the one-default
-- rule mid-update); they use set_default_linked_account instead.
revoke update (is_default) on public.linked_accounts from authenticated;

revoke execute on function public.my_upcoming_dues, public.set_default_linked_account from public, anon;
grant execute on function public.my_upcoming_dues, public.set_default_linked_account to authenticated, service_role;
revoke execute on function public.promote_default_linked_account from public, anon, authenticated;
