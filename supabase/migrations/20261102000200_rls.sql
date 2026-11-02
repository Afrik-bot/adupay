-- Row-level security. Users see their own data, group members see their group,
-- admins are identified through user_roles. Money tables have no write policies:
-- they are written only by security-definer functions (see ledger migration).

-- Helpers run as definer so policies can consult other RLS-protected tables
-- without recursion.
create function public.has_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = p_role);
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role('admin');
$$;

create function public.is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid());
$$;

create function public.shares_group_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
     where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

create function public.owns_payee(p_payee_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payees where id = p_payee_id and owner_id = auth.uid());
$$;

create function public.can_see_ledger_account(p_account_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ledger_accounts a
     where a.id = p_account_id
       and (   (a.owner_type = 'user'  and a.owner_id = auth.uid())
            or (a.owner_type = 'group' and public.is_group_member(a.owner_id))
            or (a.owner_type = 'payee' and public.owns_payee(a.owner_id)))
  ) or public.is_admin();
$$;

create function public.can_see_ledger_transaction(p_transaction_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ledger_entries e
     where e.transaction_id = p_transaction_id and public.can_see_ledger_account(e.account_id)
  );
$$;

revoke execute on function public.has_role, public.is_admin, public.is_group_member, public.shares_group_with,
  public.owns_payee, public.can_see_ledger_account, public.can_see_ledger_transaction from public, anon;
grant execute on function public.has_role, public.is_admin, public.is_group_member, public.shares_group_with,
  public.owns_payee, public.can_see_ledger_account, public.can_see_ledger_transaction to authenticated, service_role;

-- Enable RLS everywhere and start from no access for anon.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'user_roles', 'kyc_records', 'linked_accounts', 'groups', 'group_members', 'group_rules',
    'cycles', 'contributions', 'payouts', 'payees', 'directed_payments', 'savings_goals', 'ledger_accounts',
    'ledger_transactions', 'ledger_entries', 'payments', 'consents', 'risk_events', 'notifications', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    -- Supabase grants ALL to anon/authenticated by default; narrow that to
    -- SELECT, then hand back only the columns users may write (below).
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id) or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- kyc_tier is raised only by admin approval, never by the user.
grant update (full_name, user_type, country_code, city, locale) on public.profiles to authenticated;

-- user_roles: read own; granted only by service role / admin functions
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- kyc_records
create policy kyc_select on public.kyc_records for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy kyc_insert on public.kyc_records for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null);
grant insert (user_id, tier_requested, document_type, document_path, id_number_hash, id_number_last4)
  on public.kyc_records to authenticated;

-- linked_accounts
create policy linked_select on public.linked_accounts for select to authenticated
  using (user_id = auth.uid());
create policy linked_insert on public.linked_accounts for insert to authenticated
  with check (user_id = auth.uid() and verified_at is null);
create policy linked_update on public.linked_accounts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy linked_delete on public.linked_accounts for delete to authenticated
  using (user_id = auth.uid());
grant insert (user_id, provider, account_masked, account_ref_hash, label, is_default) on public.linked_accounts to authenticated;
grant update (label, is_default) on public.linked_accounts to authenticated;
grant delete on public.linked_accounts to authenticated;

-- groups and related
create policy groups_select on public.groups for select to authenticated
  using (manager_id = auth.uid() or public.is_group_member(id) or public.is_admin());
create policy groups_insert on public.groups for insert to authenticated
  with check (manager_id = auth.uid() and status = 'draft');
grant insert (name, manager_id, currency, contribution_amount, frequency, start_date, member_limit, payout_order)
  on public.groups to authenticated;

create policy group_members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());
create policy group_rules_select on public.group_rules for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());
create policy cycles_select on public.cycles for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());
create policy contributions_select on public.contributions for select to authenticated
  using (exists (select 1 from public.cycles c where c.id = cycle_id and public.is_group_member(c.group_id))
         or public.is_admin());
create policy payouts_select on public.payouts for select to authenticated
  using (exists (select 1 from public.cycles c where c.id = cycle_id and public.is_group_member(c.group_id))
         or public.is_admin());

-- payees: verified directory is public to signed-in users; owners see their own
create policy payees_select on public.payees for select to authenticated
  using (kyb_status = 'approved' or owner_id = auth.uid() or public.is_admin());
create policy payees_insert on public.payees for insert to authenticated
  with check (owner_id = auth.uid() and kyb_status = 'pending');
grant insert (name, category, city, address, rccm_number, contact_phone, owner_id, payout_provider, payout_account_masked)
  on public.payees to authenticated;

create policy directed_select on public.directed_payments for select to authenticated
  using (sender_id = auth.uid() or public.owns_payee(payee_id) or public.is_admin());

create policy savings_select on public.savings_goals for select to authenticated
  using (user_id = auth.uid());
create policy savings_insert on public.savings_goals for insert to authenticated
  with check (user_id = auth.uid());
create policy savings_update on public.savings_goals for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant insert (user_id, name, kind, target_amount, currency, lock_until, weekly_topup_amount) on public.savings_goals to authenticated;
grant update (name, target_amount, weekly_topup_amount) on public.savings_goals to authenticated;

-- ledger and payments: read-only to users, scoped to accounts they can see
create policy ledger_accounts_select on public.ledger_accounts for select to authenticated
  using (public.can_see_ledger_account(id));
create policy ledger_entries_select on public.ledger_entries for select to authenticated
  using (public.can_see_ledger_account(account_id));
create policy ledger_transactions_select on public.ledger_transactions for select to authenticated
  using (public.can_see_ledger_transaction(id));
create policy payments_select on public.payments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- consents: grant and revoke are both user actions
create policy consents_select on public.consents for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy consents_insert on public.consents for insert to authenticated
  with check (user_id = auth.uid() and revoked_at is null);
create policy consents_update on public.consents for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant insert (user_id, purpose) on public.consents to authenticated;
grant update (revoked_at) on public.consents to authenticated;

create policy risk_select on public.risk_events for select to authenticated
  using (public.is_admin() or public.has_role('compliance'));

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant update (read_at) on public.notifications to authenticated;

create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin());
