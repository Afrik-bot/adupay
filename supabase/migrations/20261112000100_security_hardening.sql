-- Phase 14 security review fixes.
--
-- 1. Column-level SELECT on profiles and payees. A table-wide SELECT let any
--    signed-in user read approved payees' payout tokens, and let people read
--    their own (and fellow members') sanctions flag, which would tip off a
--    person under review. Staff read flags through admin_sanctions_flags().
-- 2. A Postgres rate limiter for user actions (no extra paid service).
-- 3. Trigger-only functions are no longer executable through the API.

-- ---------------------------------------------------------------- 1. column grants

revoke select on public.profiles from authenticated;
grant select (id, full_name, phone, user_type, country_code, city, locale, kyc_tier, onboarded_at, created_at, updated_at)
  on public.profiles to authenticated;

revoke select on public.payees from authenticated;
grant select (id, owner_id, name, category, city, address, rccm_number, contact_phone, kyb_status, payout_provider,
              payout_account_masked, rejection_reason, submitted_at, reviewed_at, created_at, updated_at)
  on public.payees to authenticated;

/** Sanctions flags for the review screens; staff only. */
create function public.admin_sanctions_flags(p_profile_ids uuid[], p_payee_ids uuid[])
returns table (subject text, id uuid, sanctions_status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query
    select 'profile'::text, p.id, p.sanctions_status from public.profiles p where p.id = any(coalesce(p_profile_ids, '{}'))
    union all
    select 'payee'::text, y.id, y.sanctions_status from public.payees y where y.id = any(coalesce(p_payee_ids, '{}'));
end;
$$;

-- ---------------------------------------------------------------- 2. rate limits

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 1
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

/**
 * Fixed-window counter: true while `p_key` has been hit at most `p_max` times
 * in the current `p_window_seconds` window. Server only (service role).
 */
create function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_hits int;
begin
  insert into public.rate_limits as r (key) values (p_key)
  on conflict (key) do update
     set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
         window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

-- ---------------------------------------------------------------- 3. grants

revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
revoke all on function public.admin_sanctions_flags(uuid[], uuid[]) from public, anon;
grant execute on function public.admin_sanctions_flags(uuid[], uuid[]) to authenticated, service_role;

revoke execute on function public.check_entry_currency(), public.check_transaction_balanced(), public.forbid_mutation(),
  public.handle_new_user(), public.touch_updated_at() from public, anon, authenticated;
