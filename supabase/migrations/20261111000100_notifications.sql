-- Phase 12: notification delivery behind a NotificationProvider, plus the two
-- missing message triggers (contribution received, Payer pour delivered).
-- The database queues messages; the server claims them, renders the text in the
-- recipient's language and hands them to the provider (simulated until a real
-- WhatsApp/SMS provider is signed).

alter table public.notifications
  add column delivery_status text not null default 'queued'
    check (delivery_status in ('queued', 'sending', 'sent', 'failed', 'in_app')),
  add column attempts int not null default 0,
  add column claimed_at timestamptz,
  add column sent_at timestamptz,
  add column provider_ref text,
  add column last_error text;

-- In-app messages are shown in the notifications centre; nothing to deliver.
update public.notifications set delivery_status = 'in_app' where channel in ('in_app', 'ussd');

create function public.notification_initial_status() returns trigger
language plpgsql as $$
begin
  if new.channel in ('in_app', 'ussd') then
    new.delivery_status := 'in_app';
  end if;
  return new;
end;
$$;
create trigger notifications_initial_status before insert on public.notifications
  for each row execute function public.notification_initial_status();

create index notifications_queue on public.notifications (created_at) where delivery_status in ('queued', 'sending');
create index notifications_user_recent on public.notifications (user_id, created_at desc);

/**
 * Hands up to p_limit messages to one dispatcher. SKIP LOCKED keeps two
 * dispatchers from sending the same message; a claim older than 10 minutes
 * (a crashed dispatcher) is picked up again.
 */
create function public.claim_notifications(p_limit int default 50)
returns table (id uuid, user_id uuid, channel public.notification_channel, template text, payload jsonb,
               attempts int, phone text, locale text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select n.id from public.notifications n
     where (n.delivery_status = 'queued' and (n.claimed_at is null or n.claimed_at < now() - n.attempts * interval '5 minutes'))
        or (n.delivery_status = 'sending' and n.claimed_at < now() - interval '10 minutes')
     order by n.created_at
     limit greatest(1, least(p_limit, 200))
     for update skip locked
  ), claimed as (
    update public.notifications n
       set delivery_status = 'sending', claimed_at = now(), attempts = n.attempts + 1
      from picked where n.id = picked.id
    returning n.id, n.user_id, n.channel, n.template, n.payload, n.attempts
  )
  select c.id, c.user_id, c.channel, c.template, c.payload, c.attempts, p.phone, p.locale
    from claimed c join public.profiles p on p.id = c.user_id;
end;
$$;

/** Records the provider's answer. After three failed attempts the message stops retrying. */
create function public.complete_notification(p_id uuid, p_ok boolean, p_provider_ref text default null, p_error text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.notifications
     set delivery_status = case when p_ok then 'sent' when attempts >= 3 then 'failed' else 'queued' end,
         sent_at = case when p_ok then now() else sent_at end,
         provider_ref = coalesce(p_provider_ref, provider_ref),
         last_error = case when p_ok then null else left(p_error, 300) end,
         -- a failed message waits 5, then 10 minutes before the next attempt
         claimed_at = case when p_ok then null else now() end
   where id = p_id and delivery_status = 'sending';
end;
$$;

-- "We received your contribution": to the member, and to the sponsor who paid for them.
create function public.notify_contribution_received() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cycle public.cycles;
  v_group public.groups;
begin
  if new.status <> 'succeeded' or (tg_op = 'UPDATE' and old.status = 'succeeded') then
    return new;
  end if;
  select * into v_cycle from public.cycles where id = new.cycle_id;
  select * into v_group from public.groups where id = v_cycle.group_id;
  insert into public.notifications (user_id, channel, template, payload, dedupe_key)
  select r.user_id, 'whatsapp', 'contribution_received',
         jsonb_build_object('group_id', v_group.id, 'group_name', v_group.name, 'cycle', v_cycle.number,
                            'amount', new.amount, 'currency', new.currency, 'sponsored', r.user_id <> new.member_id),
         'received:' || new.id || ':' || r.user_id
    from (select new.member_id as user_id union select new.paid_by) r
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;
create trigger contributions_notify_received after insert or update of status on public.contributions
  for each row execute function public.notify_contribution_received();

-- "Your Payer pour reached the school": to the sender, once the payee's account is credited.
create function public.notify_directed_delivered() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_to text;
begin
  if new.status <> 'received' or old.status = 'received' then
    return new;
  end if;
  if new.payee_id is not null then
    select name into v_to from public.payees where id = new.payee_id;
  else
    select name into v_to from public.groups where id = new.group_id;
  end if;
  insert into public.notifications (user_id, channel, template, payload, dedupe_key)
  values (new.sender_id, 'whatsapp', 'payer_pour_delivered',
          jsonb_build_object('directed_payment_id', new.id, 'payee_name', v_to,
                             'beneficiary_name', new.beneficiary_name, 'amount', new.amount, 'currency', new.currency),
          'delivered:' || new.id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;
create trigger directed_payments_notify_delivered after update of status on public.directed_payments
  for each row execute function public.notify_directed_delivered();

-- Users may mark their own messages read, nothing else (read_at grant already exists).
create function public.mark_notifications_read() returns int
language sql security definer set search_path = public as $$
  with updated as (
    update public.notifications set read_at = now()
     where user_id = auth.uid() and read_at is null
    returning 1
  )
  select count(*)::int from updated;
$$;

revoke all on function public.claim_notifications(int), public.complete_notification(uuid, boolean, text, text),
  public.notify_contribution_received(), public.notify_directed_delivered(), public.notification_initial_status(),
  public.mark_notifications_read() from public, anon, authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
grant execute on function public.claim_notifications(int), public.complete_notification(uuid, boolean, text, text) to service_role;
