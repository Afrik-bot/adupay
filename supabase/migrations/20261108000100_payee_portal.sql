-- Phase 9: the payee portal. Businesses sign up (KYB), stay pending until an
-- admin approves them, then see and confirm the Payer pour payments they receive.

-- ---------------------------------------------------------------- payees

alter table public.payees
  add column rejection_reason text,
  add column submitted_at timestamptz,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id),
  add column updated_at timestamptz not null default now();
create trigger payees_touch before update on public.payees for each row execute function public.touch_updated_at();
-- One portal account manages one business.
create unique index payees_one_per_owner on public.payees (owner_id) where owner_id is not null;

-- Sign-up runs on the server (it verifies the payout account first); users
-- cannot write payees directly any more.
drop policy payees_insert on public.payees;
revoke insert on public.payees from authenticated;

-- ---------------------------------------------------------------- KYB documents

create table public.kyb_documents (
  id uuid primary key default gen_random_uuid(),
  payee_id uuid not null references public.payees (id) on delete cascade,
  document_type text not null check (document_type in ('rccm', 'manager_id', 'other')),
  document_path text not null,
  status public.review_status not null default 'pending',
  created_at timestamptz not null default now()
);
alter table public.kyb_documents enable row level security;
revoke all on public.kyb_documents from anon;
revoke insert, update, delete, truncate on public.kyb_documents from authenticated;
grant select on public.kyb_documents to authenticated;
grant all on public.kyb_documents to service_role;
create policy kyb_documents_select on public.kyb_documents for select to authenticated
  using (public.owns_payee(payee_id) or public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyb-documents', 'kyb-documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
create policy kyb_documents_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'kyb-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy kyb_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'kyb-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------- review (admin)

create function public.review_payee(p_payee_id uuid, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_payee public.payees;
begin
  if not public.is_admin() then
    raise exception 'only admins can review payees' using errcode = '42501';
  end if;
  if not p_approve and coalesce(trim(p_reason), '') = '' then
    raise exception 'a rejection needs a reason the business can act on' using errcode = '22023';
  end if;
  update public.payees
     set kyb_status = case when p_approve then 'approved' else 'rejected' end::public.review_status,
         rejection_reason = case when p_approve then null else p_reason end,
         reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_payee_id and kyb_status = 'pending'
  returning * into v_payee;
  if not found then
    raise exception 'no pending payee %', p_payee_id using errcode = '22023';
  end if;
  update public.kyb_documents set status = v_payee.kyb_status where payee_id = p_payee_id and status = 'pending';
  insert into public.audit_log (actor_id, action, target_table, target_id, details)
  values (auth.uid(), 'kyb.review', 'payees', p_payee_id::text,
          jsonb_build_object('decision', v_payee.kyb_status, 'reason', p_reason, 'name', v_payee.name));
end;
$$;

-- ---------------------------------------------------------------- the portal

-- Payments the caller's business has received, with filters.
create function public.payee_incoming(
  p_status text default 'all', p_from date default null, p_to date default null, p_search text default null
)
returns table (id uuid, created_at timestamptz, received_at timestamptz, confirmed_at timestamptz,
               purpose public.payment_purpose, beneficiary_name text, reference text, amount bigint,
               status public.directed_payment_status, sender_first_name text, sender_country char(2))
language sql stable security definer set search_path = public as $$
  select d.id, d.created_at, d.received_at, d.confirmed_at, d.purpose, d.beneficiary_name, d.reference, d.amount,
         d.status, split_part(coalesce(s.full_name, ''), ' ', 1), s.country_code
    from public.payees p
    join public.directed_payments d on d.payee_id = p.id
    join public.profiles s on s.id = d.sender_id
   where p.owner_id = auth.uid()
     and d.status in ('paid', 'received', 'confirmed')
     and (p_status = 'all'
          or (p_status = 'to_confirm' and d.status in ('paid', 'received'))
          or (p_status = 'confirmed' and d.status = 'confirmed'))
     and (p_from is null or d.created_at >= p_from)
     and (p_to is null or d.created_at < p_to + 1)
     and (coalesce(trim(p_search), '') = ''
          or d.beneficiary_name ilike '%' || trim(p_search) || '%'
          or d.reference ilike '%' || trim(p_search) || '%')
   order by d.created_at desc
   limit 500;
$$;

-- "Confirmer la réception": the last step of the sender's timeline.
create function public.confirm_directed_payment(p_directed_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dp public.directed_payments;
  v_payee public.payees;
begin
  select * into v_dp from public.directed_payments where id = p_directed_payment_id for update;
  if not found or not public.owns_payee(v_dp.payee_id) then
    raise exception 'not found' using errcode = '42501';
  end if;
  if v_dp.status = 'confirmed' then
    return;
  end if;
  if v_dp.status <> 'received' then
    raise exception 'not_received_yet: the money has not reached your account yet' using errcode = '22023';
  end if;
  select * into v_payee from public.payees where id = v_dp.payee_id;
  update public.directed_payments set status = 'confirmed', confirmed_at = now() where id = v_dp.id;
  insert into public.notifications (user_id, channel, template, payload, dedupe_key)
  values (v_dp.sender_id, 'whatsapp', 'payee_confirmed',
          jsonb_build_object('directed_payment_id', v_dp.id, 'payee_name', v_payee.name,
                             'beneficiary_name', v_dp.beneficiary_name, 'amount', v_dp.amount),
          'payee-confirmed:' || v_dp.id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create function public.update_payee_contact(p_contact_phone text, p_address text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.payees
     set contact_phone = nullif(trim(p_contact_phone), ''), address = nullif(trim(p_address), '')
   where owner_id = auth.uid();
  if not found then
    raise exception 'no business linked to this account' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------- real-time timeline for senders

-- Supabase Realtime pushes directed_payments changes to the sender's open page
-- (RLS still decides who receives which row). Skipped where Realtime is absent.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'directed_payments') then
    execute 'alter publication supabase_realtime add table public.directed_payments';
  end if;
end;
$$;

-- ---------------------------------------------------------------- grants

revoke execute on function public.review_payee, public.payee_incoming, public.confirm_directed_payment, public.update_payee_contact
  from public, anon;
grant execute on function public.review_payee, public.payee_incoming, public.confirm_directed_payment, public.update_payee_contact
  to authenticated, service_role;
