-- Paid whole-event cancellation. Existing events are never cancelled by migration.
create table public.tb_event_cancellations (
 event_id uuid primary key references public.sb_events(id),
 organiser_id uuid not null references public.sb_event_organisers(id),
 requested_by uuid not null references auth.users(id),
 reason text not null check(length(reason) between 10 and 1200),
 cost_consent_at timestamptz not null default now(),
 policy_version text not null default '2026-10-20-gbp25',
 fee_cents integer not null default 2500 check(fee_cents=2500),
 fee_currency text not null default 'gbp' check(fee_currency='gbp'),
 attempt integer not null default 1,
 attempt_started_at timestamptz not null default now(),
 stripe_session_id text unique,
 stripe_payment_intent_id text unique,
 checkout_expires_at timestamptz,
 paid_at timestamptz,
 cancelled_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.tb_cancellation_refunds (
 order_id uuid primary key references public.sb_event_orders(id),
 event_id uuid not null references public.tb_event_cancellations(event_id),
 customer_email text not null,
 notice_recipients jsonb not null default '[]',
 notified_emails jsonb not null default '[]',
 notice_sent_at timestamptz,
 stripe_refund_id text unique,
 refund_status text not null default 'queued' check(refund_status in('queued','pending','refunded','review')),
 refunded_cents bigint not null default 0 check(refunded_cents>=0),
 fee_cents bigint check(fee_cents>=0),
 fee_currency text check(fee_currency in('eur','gbp')),
 recovered_fee_cents bigint not null default 0 check(recovered_fee_cents>=0),
 refund_email_sent_at timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 next_attempt_at timestamptz not null default now(),
 attempts integer not null default 0,
 last_error text,
 updated_at timestamptz not null default now()
);
create index tb_cancel_refunds_due on public.tb_cancellation_refunds(next_attempt_at) where refund_email_sent_at is null or fee_cents is null;
create table public.tb_cancellation_notice_batches (
 id uuid primary key default gen_random_uuid(),order_ids uuid[] not null,payload jsonb,
 accepted_at timestamptz,lease_token uuid,lease_until timestamptz,next_attempt_at timestamptz not null default now()
);
alter table public.tb_cancellation_refunds add column notice_batch_id uuid references public.tb_cancellation_notice_batches(id);
alter table public.tb_cancellation_notice_batches enable row level security;
revoke all on public.tb_cancellation_notice_batches from public,anon,authenticated;
grant all on public.tb_cancellation_notice_batches to service_role;
alter table public.tb_event_cancellations enable row level security;
alter table public.tb_cancellation_refunds enable row level security;
revoke all on public.tb_event_cancellations,public.tb_cancellation_refunds from public,anon,authenticated;
grant all on public.tb_event_cancellations,public.tb_cancellation_refunds to service_role;

create function public.tb_prepare_event_cancellation(p_actor uuid,p_event uuid,p_reason text,p_previous_session text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.sb_events;c public.tb_event_cancellations;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_event::text,202));
 select * into e from public.sb_events where id=p_event for update;
 if not found or (e.status<>'published' and not(e.status='draft' and exists(select 1 from public.tb_event_postponements where event_id=e.id and applied_at is not null and published_at is null))) or e.internal_free_test or e.public_beta_test or e.ends_at is null or(e.ends_at<=now() and e.status<>'draft')
 or not exists(select 1 from public.sb_event_organisers o where o.id=e.organiser_profile_id and o.owner_user_id=p_actor and o.status='approved')
 then raise exception 'A published event owned by this organiser is required; imminent or finished events need support';end if;
 if exists(select 1 from public.tb_event_settlements where event_id=p_event and (release_token is not null or stripe_payout_id is not null))
 or exists(select 1 from public.tb_ticket_payments where event_id=p_event and stripe_transfer_id is not null)
 then raise exception 'Released funds require support before cancellation';end if;
 insert into public.tb_event_cancellations(event_id,organiser_id,requested_by,reason)
 values(p_event,e.organiser_profile_id,p_actor,p_reason) on conflict do nothing;
 select * into c from public.tb_event_cancellations where event_id=p_event for update;
 if p_previous_session is not null and c.stripe_session_id=p_previous_session and c.paid_at is null and c.checkout_expires_at<now() then
  update public.tb_event_cancellations set attempt=attempt+1,attempt_started_at=now(),stripe_session_id=null,checkout_expires_at=null where event_id=p_event returning * into c;
 end if;
 return to_jsonb(c);
end $$;

create function public.tb_queue_cancelled_order(p_order uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare o public.sb_event_orders;
begin
 select * into o from public.sb_event_orders where id=p_order;
 if not found then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(o.event_id::text,202));
 if not exists(select 1 from public.tb_event_cancellations c join public.sb_events e on e.id=c.event_id where c.event_id=o.event_id and c.cancelled_at is not null and e.status='cancelled') then return false;end if;
 if o.beta_test_order then return true;end if;
 if o.status not in('paid','refunded','needs_attention') and not exists(select 1 from public.tb_ticket_payments where order_id=o.id) then return true;end if;
 insert into public.tb_cancellation_refunds(order_id,event_id,customer_email,notice_recipients)
 select o.id,o.event_id,o.customer_email,coalesce(jsonb_agg(x.email),'[]') from(
  select lower(o.customer_email) email union select lower(t.holder_email) from public.sb_event_tickets t where t.order_id=o.id and t.holder_email is not null
 )x where x.email<>'' on conflict do nothing;
 return true;
end $$;

create function public.tb_confirm_event_cancellation(p_event uuid,p_session text,p_intent text,p_attempt integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.tb_event_cancellations;e public.sb_events;o record;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_event::text,202));
 select * into c from public.tb_event_cancellations where event_id=p_event for update;
 if not found or c.attempt<>p_attempt or(c.stripe_session_id is not null and c.stripe_session_id<>p_session) then raise exception 'Cancellation payment mismatch';end if;
 if c.cancelled_at is not null then return true;end if;
 select * into e from public.sb_events where id=p_event for update;
 if e.status not in('published','draft') or exists(select 1 from public.tb_event_settlements where event_id=p_event and (release_token is not null or stripe_payout_id is not null))
 or exists(select 1 from public.tb_ticket_payments where event_id=p_event and stripe_transfer_id is not null) then raise exception 'Event requires cancellation review';end if;
 update public.tb_event_cancellations set paid_at=now(),cancelled_at=now(),stripe_session_id=p_session,stripe_payment_intent_id=p_intent where event_id=p_event;
 update public.sb_events set status='cancelled' where id=p_event;
 insert into public.tb_event_settlements(event_id,payout_status,payout_message)values(p_event,'blocked','Event cancelled. Buyer refunds take priority; organiser payout is stopped.')
 on conflict(event_id)do update set payout_status='blocked',payout_message=excluded.payout_message,updated_at=now();
 for o in select id from public.sb_event_orders where event_id=p_event and status in('paid','refunded','needs_attention') and not beta_test_order loop
  perform public.tb_queue_cancelled_order(o.id);
 end loop;
 return true;
end $$;

create function public.tb_cancel_late_paid_order()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status in('paid','needs_attention') and old.status is distinct from new.status then perform public.tb_queue_cancelled_order(new.id);end if;
 return new;
end $$;
create trigger tb_cancel_late_paid_order after update of status on public.sb_event_orders for each row execute function public.tb_cancel_late_paid_order();

create function public.tb_claim_cancellation_refunds(p_token uuid,p_limit integer default 20)
returns setof public.tb_cancellation_refunds language sql security invoker set search_path='' as $$
 update public.tb_cancellation_refunds j set lease_token=p_token,lease_until=now()+interval '5 minutes',attempts=attempts+1
 where j.order_id in(select r.order_id from public.tb_cancellation_refunds r
 where (r.lease_until is null or r.lease_until<now()) and r.next_attempt_at<=now()
 and (r.notice_sent_at is null or r.refund_email_sent_at is null or r.fee_cents is null)
 order by r.notice_sent_at nulls first,r.next_attempt_at,r.order_id for update skip locked limit least(greatest(p_limit,1),20)) returning j.*;
$$;
create function public.tb_claim_cancel_notice_batch(p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.tb_cancellation_notice_batches;ids uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended('tb-cancel-notices',202));
 select * into b from public.tb_cancellation_notice_batches where accepted_at is null and next_attempt_at<=now() and(lease_until is null or lease_until<now()) order by next_attempt_at limit 1 for update;
 if not found then
  select array_agg(x.order_id) into ids from(
   select order_id,sum(jsonb_array_length(notice_recipients))over(order by order_id) as recipients
   from public.tb_cancellation_refunds where notice_sent_at is null and notice_batch_id is null
  )x where recipients<=100;
  if ids is null then return null;end if;
  insert into public.tb_cancellation_notice_batches(order_ids)values(ids) returning * into b;
  update public.tb_cancellation_refunds set notice_batch_id=b.id where order_id=any(ids);
 end if;
 update public.tb_cancellation_notice_batches set lease_token=p_token,lease_until=now()+interval '5 minutes' where id=b.id returning * into b;
 return to_jsonb(b);
end $$;
create function public.tb_finish_cancel_notice_batch(p_batch uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare ids uuid[];
begin
 update public.tb_cancellation_notice_batches set accepted_at=now(),lease_token=null,lease_until=null where id=p_batch and lease_token=p_token returning order_ids into ids;
 if ids is null then return false;end if;
 update public.tb_cancellation_refunds set notice_sent_at=now(),notified_emails=notice_recipients where order_id=any(ids);
 return true;
end $$;
revoke all on function public.tb_prepare_event_cancellation(uuid,uuid,text,text),public.tb_queue_cancelled_order(uuid),public.tb_confirm_event_cancellation(uuid,text,text,integer),public.tb_claim_cancellation_refunds(uuid,integer),public.tb_cancel_late_paid_order() from public,anon,authenticated;
grant execute on function public.tb_prepare_event_cancellation(uuid,uuid,text,text),public.tb_queue_cancelled_order(uuid),public.tb_confirm_event_cancellation(uuid,text,text,integer),public.tb_claim_cancellation_refunds(uuid,integer),public.tb_cancel_late_paid_order() to service_role;
revoke all on function public.tb_claim_cancel_notice_batch(uuid),public.tb_finish_cancel_notice_batch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tb_claim_cancel_notice_batch(uuid),public.tb_finish_cancel_notice_batch(uuid,uuid) to service_role;
CREATE OR REPLACE FUNCTION public.tb_claim_event_release(p_event uuid, p_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare e public.sb_events;s public.tb_event_settlements;
begin
 if current_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event::text,202));
 if exists(select 1 from public.tb_event_cancellations where event_id=p_event and cancelled_at is null and attempt_started_at>now()-interval '1 hour') then return false;end if;
 if exists(select 1 from public.tb_postponement_choices where event_id=p_event and choice='pending') or exists(select 1 from public.tb_cancellation_refunds where event_id=p_event and refund_status<>'refunded') then return false;end if;
 select * into e from public.sb_events where id=p_event for update;
 if not found or e.status<>'published' or e.internal_free_test or e.public_beta_test or e.ends_at is null or e.ends_at>now() or not exists(select 1 from public.tb_event_reports where event_id=p_event) then return false;end if;
 if exists(select 1 from public.tb_refund_requests where event_id=p_event and status in ('requested','reviewing','approved','processing')) then return false;end if;
 insert into public.tb_event_settlements(event_id)values(p_event)on conflict do nothing;
 select * into s from public.tb_event_settlements where event_id=p_event for update;
 if s.payout_status in ('processing','paid','blocked') or (s.release_started_at>now()-interval '5 minutes' and s.release_token<>p_token) then return false;end if;
 update public.tb_event_settlements set payout_status='reconciling',release_token=p_token,release_started_at=now() where event_id=p_event;
 return true;
end;$function$;
