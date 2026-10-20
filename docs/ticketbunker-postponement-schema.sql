-- Same event and ticket identities; every postponement remains in the history.
create table public.tb_event_postponements(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.sb_events(id),
 organiser_id uuid not null references public.sb_event_organisers(id),requested_by uuid not null references auth.users(id),
 reason text not null check(length(reason) between 10 and 1200),original_starts_at timestamptz not null,original_ends_at timestamptz,
 new_starts_at timestamptz,new_ends_at timestamptz,paid_at timestamptz,applied_at timestamptz,published_at timestamptz,
 stripe_session_id text unique,stripe_payment_intent_id text unique,fee_refunded_at timestamptz,
 attempt integer not null default 1,attempt_started_at timestamptz not null default now(),checkout_expires_at timestamptz,
 cost_consent_at timestamptz not null default now(),created_at timestamptz not null default now()
);
create unique index tb_postponement_one_open on public.tb_event_postponements(event_id) where published_at is null and fee_refunded_at is null;
create table public.tb_postponement_choices(
 postponement_id uuid not null references public.tb_event_postponements(id),order_id uuid not null references public.sb_event_orders(id),
 event_id uuid not null references public.sb_events(id),choice text not null default 'pending' check(choice in('pending','rollover','refund')),
 chosen_at timestamptz,notice_recipients jsonb not null default '[]',notice_stage text not null default 'postponed',
 notice_batch_id uuid references public.tb_cancellation_notice_batches(id),notice_sent_at timestamptz,
 primary key(postponement_id,order_id)
);
alter table public.tb_cancellation_refunds drop constraint tb_cancellation_refunds_event_id_fkey;
alter table public.tb_cancellation_refunds add foreign key(event_id) references public.sb_events(id);
alter table public.tb_cancellation_refunds add column postponement_id uuid references public.tb_event_postponements(id);
alter table public.tb_cancellation_notice_batches add column postponement_id uuid references public.tb_event_postponements(id);
alter table public.tb_cancellation_notice_batches add column notice_stage text;
alter table public.tb_event_postponements enable row level security;
alter table public.tb_postponement_choices enable row level security;
revoke all on public.tb_event_postponements,public.tb_postponement_choices from public,anon,authenticated;
grant all on public.tb_event_postponements,public.tb_postponement_choices to service_role;

create function public.tb_prepare_postponement(p_actor uuid,p_event uuid,p_reason text,p_previous_session text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.sb_events;p public.tb_event_postponements;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_event::text,202));
 select * into e from public.sb_events where id=p_event for update;
 if not found or not exists(select 1 from public.sb_event_organisers where id=e.organiser_profile_id and owner_user_id=p_actor and status='approved') then raise exception 'Event owner required';end if;
 select * into p from public.tb_event_postponements where event_id=p_event and published_at is null and fee_refunded_at is null for update;
 if found and p.applied_at is not null then return to_jsonb(p);end if;
 if e.status<>'published' or e.internal_free_test or e.public_beta_test or e.starts_at<=now()+interval '48 hours' then raise exception 'Postponement closes 48 hours before the original start';end if;
 if exists(select 1 from public.tb_event_settlements where event_id=p_event and release_token is not null) then raise exception 'Payment release requires support';end if;
 if p.id is null then insert into public.tb_event_postponements(event_id,organiser_id,requested_by,reason,original_starts_at,original_ends_at)values(p_event,e.organiser_profile_id,p_actor,p_reason,e.starts_at,e.ends_at) returning * into p;end if;
 if p_previous_session is not null and p.stripe_session_id=p_previous_session and p.checkout_expires_at<now() then
  update public.tb_event_postponements set attempt=attempt+1,attempt_started_at=now(),stripe_session_id=null,checkout_expires_at=null where id=p.id returning * into p;
 end if;
 return to_jsonb(p);
end $$;
create function public.tb_apply_postponement(p_id uuid,p_session text,p_intent text,p_attempt integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare p public.tb_event_postponements;e public.sb_events;
begin
 select * into p from public.tb_event_postponements where id=p_id;
 if not found then raise exception 'Postponement unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(p.event_id::text,202));
 select * into p from public.tb_event_postponements where id=p_id for update;
 if p.applied_at is not null then return true;end if;
 select * into e from public.sb_events where id=p.event_id for update;
 if p.attempt<>p_attempt or(p.stripe_session_id is not null and p.stripe_session_id<>p_session)then raise exception 'Payment mismatch';end if;
 if e.status<>'published' or e.starts_at<>p.original_starts_at or e.starts_at<=now()+interval '48 hours' then raise exception 'Postponement window closed';end if;
 update public.tb_event_postponements set stripe_session_id=p_session,stripe_payment_intent_id=p_intent,paid_at=now(),applied_at=now() where id=p_id;
 update public.sb_events set status='draft' where id=e.id;
 insert into public.tb_postponement_choices(postponement_id,order_id,event_id,notice_recipients)
 select p_id,o.id,e.id,(select jsonb_agg(x.email) from(select lower(o.customer_email) email union select lower(t.holder_email) from public.sb_event_tickets t where t.order_id=o.id and t.holder_email is not null)x where x.email<>'')
 from public.sb_event_orders o where o.event_id=e.id and o.status='paid' and not o.beta_test_order on conflict do nothing;
 update public.sb_event_orders set status='needs_attention' where event_id=e.id and status='paid' and not beta_test_order;
 return true;
end $$;
create function public.tb_choose_postponement(p_actor uuid,p_id uuid,p_order uuid,p_choice text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare p public.tb_event_postponements;c public.tb_postponement_choices;o public.sb_event_orders;
begin
 if p_choice not in('rollover','refund')then raise exception 'Choose refund or rollover';end if;
 select * into p from public.tb_event_postponements where id=p_id and applied_at is not null;
 if not found then raise exception 'Postponement unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(p.event_id::text,202));
 select * into c from public.tb_postponement_choices where postponement_id=p_id and order_id=p_order for update;
 select * into o from public.sb_event_orders where id=p_order for update;
 if exists(select 1 from public.tb_event_postponements where event_id=p.event_id and applied_at>p.applied_at)then raise exception 'A newer postponement supersedes this choice';end if;
 if c.order_id is null or not exists(select 1 from auth.users where id=p_actor and lower(email)=lower(o.customer_email) and email_confirmed_at is not null)then raise exception 'Original verified purchaser required';end if;
 if not exists(select 1 from public.sb_events where id=p.event_id and status in('draft','published')) or exists(select 1 from public.tb_event_settlements where event_id=p.event_id and(release_token is not null or stripe_payout_id is not null))then raise exception 'Event requires support';end if;
 if c.choice=p_choice then return true;end if;
 if c.choice='refund' or o.status='refunded' or exists(select 1 from public.sb_event_tickets where order_id=p_order and checked_in_at is not null) then raise exception 'Choice cannot be changed; contact support';end if;
 update public.tb_postponement_choices set choice=p_choice,chosen_at=now() where postponement_id=p_id and order_id=p_order;
 if p_choice='rollover' then update public.sb_event_orders set status='paid' where id=p_order and status='needs_attention';
 else
  update public.sb_event_orders set status='needs_attention' where id=p_order and status='paid';
  insert into public.tb_cancellation_refunds(order_id,event_id,customer_email,notice_recipients,notice_sent_at,postponement_id)
  values(o.id,p.event_id,o.customer_email,c.notice_recipients,now(),p_id)on conflict do nothing;
 end if;
 return true;
end $$;
create function public.tb_repost_postponement()
returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.tb_event_postponements;
begin
 if new.status='published' and old.status='draft' then
  select * into p from public.tb_event_postponements where event_id=new.id and applied_at is not null and published_at is null;
  if found then
   if new.starts_at<=p.original_starts_at or new.ends_at<=new.starts_at then raise exception 'Set the rescheduled event to a later start and a valid finish';end if;
   update public.tb_event_postponements set published_at=now(),new_starts_at=new.starts_at,new_ends_at=new.ends_at where id=p.id;
   update public.tb_postponement_choices c set notice_stage='rescheduled',notice_sent_at=null,notice_batch_id=null,
    notice_recipients=(select jsonb_agg(x.email) from(select lower(o.customer_email) email union select lower(t.holder_email) from public.sb_event_tickets t where t.order_id=o.id and t.holder_email is not null)x where x.email<>'')
   from public.sb_event_orders o where c.order_id=o.id and c.postponement_id=p.id and c.choice<>'refund';
  end if;
 end if;return new;
end $$;
create trigger tb_repost_postponement after update of status on public.sb_events for each row execute function public.tb_repost_postponement();

create or replace function public.tb_claim_cancel_notice_batch(p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.tb_cancellation_notice_batches;ids uuid[];pid uuid;stage text;
begin
 perform pg_advisory_xact_lock(hashtextextended('tb-cancel-notices',202));
 select * into b from public.tb_cancellation_notice_batches where accepted_at is null and next_attempt_at<=now() and(lease_until is null or lease_until<now()) order by next_attempt_at limit 1 for update;
 if not found then
  select array_agg(x.order_id) into ids from(select order_id,sum(jsonb_array_length(notice_recipients))over(order by order_id)recipients from public.tb_cancellation_refunds where notice_sent_at is null and notice_batch_id is null)x where recipients<=100;
  if ids is null then
   select postponement_id,notice_stage into pid,stage from public.tb_postponement_choices where notice_sent_at is null and notice_batch_id is null order by postponement_id,order_id limit 1;
   if not found then return null;end if;
   select array_agg(x.order_id) into ids from(select order_id,sum(jsonb_array_length(notice_recipients))over(order by order_id)recipients from public.tb_postponement_choices where postponement_id=pid and notice_stage=stage and notice_sent_at is null and notice_batch_id is null)x where recipients<=100;
  end if;
  insert into public.tb_cancellation_notice_batches(order_ids,postponement_id,notice_stage)values(ids,pid,stage) returning * into b;
  if pid is null then update public.tb_cancellation_refunds set notice_batch_id=b.id where order_id=any(ids);
  else update public.tb_postponement_choices set notice_batch_id=b.id where postponement_id=pid and order_id=any(ids);end if;
 end if;
 update public.tb_cancellation_notice_batches set lease_token=p_token,lease_until=now()+interval '5 minutes' where id=b.id returning * into b;return to_jsonb(b);
end $$;
create or replace function public.tb_finish_cancel_notice_batch(p_batch uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare b public.tb_cancellation_notice_batches;
begin
 update public.tb_cancellation_notice_batches set accepted_at=now(),lease_token=null,lease_until=null where id=p_batch and lease_token=p_token returning * into b;
 if not found then return false;end if;
 if b.postponement_id is null then update public.tb_cancellation_refunds set notice_sent_at=now(),notified_emails=notice_recipients where order_id=any(b.order_ids);
 else update public.tb_postponement_choices set notice_sent_at=now() where postponement_id=b.postponement_id and order_id=any(b.order_ids) and notice_batch_id=p_batch;end if;return true;
end $$;
create function public.tb_credit_refund_processing(p_event uuid)
returns void language sql security invoker set search_path='' as $$
 update public.tb_cancellation_refunds j set recovered_fee_cents=greatest(j.recovered_fee_cents,coalesce(p.processing_fee_cents,0))
 from public.tb_ticket_payments p,public.tb_event_settlements s
 where j.order_id=p.order_id and j.event_id=p_event and j.postponement_id is not null and s.event_id=p_event and s.reconciled_at is not null;
$$;
create function public.tb_queue_changed_order(p_order uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare o public.sb_event_orders;p public.tb_event_postponements;recipients jsonb;
begin
 if public.tb_queue_cancelled_order(p_order)then return true;end if;
 select * into o from public.sb_event_orders where id=p_order;
 select * into p from public.tb_event_postponements where event_id=o.event_id and applied_at is not null and published_at is null;
 if not found or not exists(select 1 from public.tb_ticket_payments where order_id=p_order)or exists(select 1 from public.sb_event_tickets where order_id=p_order)then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(o.event_id::text,202));
 recipients=jsonb_build_array(lower(o.customer_email));
 insert into public.tb_postponement_choices(postponement_id,order_id,event_id,choice,chosen_at,notice_recipients)values(p.id,o.id,o.event_id,'refund',now(),recipients)on conflict do nothing;
 insert into public.tb_cancellation_refunds(order_id,event_id,customer_email,notice_recipients,notice_sent_at,postponement_id)values(o.id,o.event_id,o.customer_email,recipients,now(),p.id)on conflict do nothing;
 update public.sb_event_orders set status='needs_attention' where id=o.id and status in('reserved','cancelled');
 return true;
end $$;
create or replace function public.tb_cancel_late_paid_order()
returns trigger language plpgsql security invoker set search_path='' as $$
begin if new.status in('paid','needs_attention')and old.status is distinct from new.status then perform public.tb_queue_changed_order(new.id);end if;return new;end $$;
revoke all on function public.tb_prepare_postponement(uuid,uuid,text,text),public.tb_apply_postponement(uuid,text,text,integer),public.tb_choose_postponement(uuid,uuid,uuid,text),public.tb_repost_postponement(),public.tb_credit_refund_processing(uuid) from public,anon,authenticated;
grant execute on function public.tb_prepare_postponement(uuid,uuid,text,text),public.tb_apply_postponement(uuid,text,text,integer),public.tb_choose_postponement(uuid,uuid,uuid,text),public.tb_repost_postponement(),public.tb_credit_refund_processing(uuid) to service_role;
revoke all on function public.tb_queue_changed_order(uuid) from public,anon,authenticated;
grant execute on function public.tb_queue_changed_order(uuid) to service_role;
