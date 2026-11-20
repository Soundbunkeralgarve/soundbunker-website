begin;
-- Door sales and a live door count for the TicketBunker Scanner app (Nov 2026).
-- Card door sales are ordinary separate_v1 Stripe orders, so they are paid out,
-- refunded and reported exactly like online sales. Cash door sales never touch
-- Stripe: the organiser already holds the money, so payouts and refunds skip them.
alter table public.sb_event_orders add column if not exists door_sale text;
alter table public.sb_event_orders add column if not exists door_seller uuid references auth.users(id);
alter table public.sb_event_orders drop constraint if exists sb_event_orders_door_sale_check;
alter table public.sb_event_orders add constraint sb_event_orders_door_sale_check check(door_sale is null or door_sale in ('card','cash'));
alter table public.sb_event_orders drop constraint if exists sb_event_orders_door_cash_offline_check;
alter table public.sb_event_orders add constraint sb_event_orders_door_cash_offline_check check(door_sale is distinct from 'cash' or tb_payment_flow is null);
create index if not exists sb_event_orders_door_idx on public.sb_event_orders(event_id,door_sale) where door_sale is not null;

-- Manual clicker for walk-ins and exits; the live count adds these to admitted tickets.
create table if not exists public.tb_door_count_adjustments(
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.sb_events(id),
 actor uuid not null references auth.users(id),
 delta integer not null check(delta in (-1,1)),
 created_at timestamptz not null default now()
);
create index if not exists tb_door_count_adjustments_event_idx on public.tb_door_count_adjustments(event_id);
alter table public.tb_door_count_adjustments enable row level security;
revoke all on public.tb_door_count_adjustments from public,anon,authenticated;
grant select,insert on public.tb_door_count_adjustments to service_role;

-- Same people who may scan: admins, invited door crew and the event's organiser.
create or replace function public.tb_door_access(p_event uuid,p_actor uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select p_actor is not null and (
  exists(select 1 from public.profiles p where p.id=p_actor and p.role='admin')
  or exists(select 1 from public.sb_event_staff_access s where s.event_id=p_event and s.user_id=p_actor and s.revoked_at is null)
  or exists(select 1 from public.sb_events e join public.sb_event_organisers o on o.id=e.organiser_profile_id where e.id=p_event and o.owner_user_id=p_actor))
$$;
-- The door is open during the check-in window, or while a private rehearsal is active.
create or replace function public.tb_door_is_open(p_event uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.sb_events e where e.id=p_event and (
  (e.status='published' and not e.internal_free_test and not e.public_beta_test and now()>=e.starts_at-interval '18 hours' and now()<=e.starts_at+interval '36 hours')
  or (e.status='published' and e.internal_free_test and e.test_expires_at>now())))
$$;
revoke all on function public.tb_door_access(uuid,uuid) from public,anon,authenticated;
revoke all on function public.tb_door_is_open(uuid) from public,anon,authenticated;
grant execute on function public.tb_door_access(uuid,uuid) to service_role;
grant execute on function public.tb_door_is_open(uuid) to service_role;

create or replace function public.tb_door_summary(p_event uuid,p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare e public.sb_events;admitted bigint;adjusted bigint;
begin
 if coalesce(auth.role(),'')<>'service_role' and current_user<>'postgres' then raise exception 'Service access required';end if;
 if not public.tb_door_access(p_event,p_actor) then raise exception 'Door access denied';end if;
 select * into e from public.sb_events where id=p_event;
 select count(*) into admitted from public.sb_event_tickets t join public.sb_event_orders o on o.id=t.order_id where t.event_id=p_event and o.status='paid' and t.checked_in_at is not null;
 select coalesce(sum(delta),0) into adjusted from public.tb_door_count_adjustments where event_id=p_event;
 return jsonb_build_object(
  'inside',greatest(0,admitted+adjusted),'admitted',admitted,'manual',adjusted,
  'sold',(select coalesce(sum(quantity),0) from public.sb_event_orders where event_id=p_event and status='paid'),
  'capacity',(select coalesce(sum(quantity_total),0) from public.sb_event_tiers where event_id=p_event),
  'doorCard',(select jsonb_build_object('tickets',coalesce(sum(quantity),0),'cents',coalesce(sum(total_cents),0)) from public.sb_event_orders where event_id=p_event and status='paid' and door_sale='card'),
  'doorCash',(select jsonb_build_object('tickets',coalesce(sum(quantity),0),'cents',coalesce(sum(total_cents),0)) from public.sb_event_orders where event_id=p_event and status='paid' and door_sale='cash'),
  'currency',e.currency,'open',public.tb_door_is_open(p_event),'rehearsal',coalesce(e.internal_free_test,false),
  'tiers',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'priceCents',t.price_cents,
    'remaining',greatest(0,t.quantity_total-public.sb_guest_reserved(t.id)-(select coalesce(sum(o.quantity),0) from public.sb_event_orders o where o.tier_id=t.id and (o.status in ('paid','needs_attention') or (o.status='reserved' and o.reserved_until>now())))))
   order by t.price_cents,t.name) from public.sb_event_tiers t where t.event_id=p_event),'[]'::jsonb));
end;$$;

create or replace function public.tb_door_adjust(p_event uuid,p_actor uuid,p_delta integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' and current_user<>'postgres' then raise exception 'Service access required';end if;
 if not public.tb_door_access(p_event,p_actor) then raise exception 'Door access denied';end if;
 if p_delta not in (-1,1) then raise exception 'Count by one at a time';end if;
 if not public.tb_door_is_open(p_event) then raise exception 'The door count is closed for this event';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event::text,301));
 if p_delta<0 and ((public.tb_door_summary(p_event,p_actor)->>'inside')::bigint)<=0 then raise exception 'The count is already at zero';end if;
 insert into public.tb_door_count_adjustments(event_id,actor,delta) values(p_event,p_actor,p_delta);
 return public.tb_door_summary(p_event,p_actor);
end;$$;

-- Shared checks for both payment types. Returns the locked tier.
create or replace function public.tb_door_sale_tier(p_event uuid,p_tier uuid,p_quantity integer,p_actor uuid)
returns public.sb_event_tiers language plpgsql security invoker set search_path='' as $$
declare t public.sb_event_tiers;used_count bigint;
begin
 if not public.tb_door_access(p_event,p_actor) then raise exception 'Door access denied';end if;
 if not public.tb_door_is_open(p_event) then raise exception 'Door sales are closed for this event';end if;
 if p_quantity is null or p_quantity<1 or p_quantity>8 then raise exception 'Sell 1 to 8 tickets at a time';end if;
 select * into t from public.sb_event_tiers where id=p_tier and event_id=p_event for update;
 if not found then raise exception 'Ticket type unavailable';end if;
 select coalesce(sum(quantity),0) into used_count from public.sb_event_orders where tier_id=p_tier and (status in ('paid','needs_attention') or (status='reserved' and reserved_until>now()));
 if used_count+public.sb_guest_reserved(p_tier)+p_quantity>t.quantity_total then raise exception 'Not enough % tickets left',t.name;end if;
 return t;
end;$$;

create or replace function public.tb_door_cash_sale(p_request uuid,p_event uuid,p_tier uuid,p_quantity integer,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.sb_event_tiers;e public.sb_events;r public.sb_event_orders;
begin
 if coalesce(auth.role(),'')<>'service_role' and current_user<>'postgres' then raise exception 'Service access required';end if;
 if p_request is null then raise exception 'Missing door sale reference';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,201));
 select * into r from public.sb_event_orders where tb_checkout_key=p_request;
 if found then
  if r.door_sale is distinct from 'cash' or r.tier_id<>p_tier or r.quantity<>p_quantity or r.door_seller is distinct from p_actor then raise exception 'Start a new door sale';end if;
 else
  t:=public.tb_door_sale_tier(p_event,p_tier,p_quantity,p_actor);
  select * into e from public.sb_events where id=p_event;
  insert into public.sb_event_orders(event_id,tier_id,customer_name,customer_email,quantity,total_cents,status,reserved_until,currency,paid_at,tb_checkout_key,door_sale,door_seller)
  values(p_event,p_tier,'Door sale · cash','bookings@theticketbunker.com',p_quantity,t.price_cents*p_quantity,'paid',now(),e.currency,now(),p_request,'cash',p_actor) returning * into r;
  -- The buyer is standing at the door, so the tickets are admitted as they are sold.
  insert into public.sb_event_tickets(order_id,event_id,tier_id,sequence_number,checked_in_at,checked_in_by)
  select r.id,r.event_id,r.tier_id,n,now(),p_actor from generate_series(1,p_quantity) n;
 end if;
 return jsonb_build_object('orderId',r.id,'status',r.status,'quantity',r.quantity,'totalCents',r.total_cents,'currency',r.currency);
end;$$;

create or replace function public.tb_door_card_reserve(p_request uuid,p_event uuid,p_tier uuid,p_quantity integer,p_actor uuid)
returns public.sb_event_orders language plpgsql security invoker set search_path='' as $$
declare t public.sb_event_tiers;e public.sb_events;r public.sb_event_orders;
begin
 if coalesce(auth.role(),'')<>'service_role' and current_user<>'postgres' then raise exception 'Service access required';end if;
 if p_request is null then raise exception 'Missing door sale reference';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,201));
 select * into r from public.sb_event_orders where tb_checkout_key=p_request;
 if found then
  if r.door_sale is distinct from 'card' or r.tier_id<>p_tier or r.quantity<>p_quantity or r.door_seller is distinct from p_actor or r.status<>'reserved' or r.reserved_until<=now() then raise exception 'Start a new door sale';end if;
  return r;
 end if;
 select * into e from public.sb_events where id=p_event;
 if e.internal_free_test then raise exception 'Card payments are off for rehearsal events. Use cash to practise.';end if;
 t:=public.tb_door_sale_tier(p_event,p_tier,p_quantity,p_actor);
 if t.price_cents<=0 then raise exception 'This ticket type is free';end if;
 insert into public.sb_event_orders(event_id,tier_id,customer_name,customer_email,quantity,total_cents,reserved_until,currency,tb_checkout_key,tb_payment_flow,door_sale,door_seller)
 values(p_event,p_tier,'Door sale · card','bookings@theticketbunker.com',p_quantity,t.price_cents*p_quantity,now()+interval '35 minutes',e.currency,p_request,'separate_v1','card',p_actor) returning * into r;
 return r;
end;$$;

-- A paid card door sale is admitted as soon as Stripe confirms it.
create or replace function public.tb_door_admit_order(p_order uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare o public.sb_event_orders;n integer;
begin
 if coalesce(auth.role(),'')<>'service_role' and current_user<>'postgres' then raise exception 'Service access required';end if;
 select * into o from public.sb_event_orders where id=p_order;
 if not found or o.door_sale is null or o.status<>'paid' then return 0;end if;
 update public.sb_event_tickets set checked_in_at=now(),checked_in_by=o.door_seller where order_id=o.id and checked_in_at is null;
 get diagnostics n=row_count;
 return n;
end;$$;

do $$declare f text;begin
 foreach f in array array['tb_door_summary(uuid,uuid)','tb_door_adjust(uuid,uuid,integer)','tb_door_sale_tier(uuid,uuid,integer,uuid)','tb_door_cash_sale(uuid,uuid,uuid,integer,uuid)','tb_door_card_reserve(uuid,uuid,uuid,integer,uuid)','tb_door_admit_order(uuid)'] loop
  execute 'revoke all on function public.'||f||' from public,anon,authenticated';
  execute 'grant execute on function public.'||f||' to service_role';
 end loop;
end$$;

-- Event cancellations refund Stripe payments only; cash taken at the door stays with the organiser.
create or replace function public.tb_queue_cancelled_order(p_order uuid)
returns boolean language plpgsql set search_path to '' as $function$
declare o public.sb_event_orders;
begin
 select * into o from public.sb_event_orders where id=p_order; if not found then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(o.event_id::text,202));
 if not exists(select 1 from public.tb_event_cancellations c join public.sb_events e on e.id=c.event_id where c.event_id=o.event_id and c.cancelled_at is not null and e.status='cancelled') then return false;end if;
 if o.beta_test_order or o.door_sale='cash' then return true;end if;
 if o.status not in('paid','refunded','needs_attention') and not exists(select 1 from public.tb_ticket_payments where order_id=o.id) then return true;end if;
 insert into public.tb_cancellation_refunds(order_id,event_id,customer_email,notice_recipients)
 select o.id,o.event_id,o.customer_email,coalesce(jsonb_agg(x.email),'[]') from(
  select lower(o.customer_email) email union select lower(t.holder_email) from public.sb_event_tickets t where t.order_id=o.id and t.holder_email is not null
 )x where x.email<>'' on conflict do nothing;
 return true;
end $function$;
commit;
