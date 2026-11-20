-- TicketBunker door price: an optional price per ticket type used only for sales at the door.
-- Online prices are unchanged. Apply after SUPABASE_TICKETBUNKER_DOOR_SALES.sql.
alter table public.sb_event_tiers add column if not exists door_price_cents integer;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='sb_event_tiers_door_price_check') then
  alter table public.sb_event_tiers add constraint sb_event_tiers_door_price_check check(door_price_cents is null or door_price_cents between 100 and 10000000);
 end if;
end $$;

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
  'tiers',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'priceCents',coalesce(t.door_price_cents,t.price_cents),'onlinePriceCents',t.price_cents,
    'remaining',greatest(0,t.quantity_total-public.sb_guest_reserved(t.id)-(select coalesce(sum(o.quantity),0) from public.sb_event_orders o where o.tier_id=t.id and (o.status in ('paid','needs_attention') or (o.status='reserved' and o.reserved_until>now())))))
   order by coalesce(t.door_price_cents,t.price_cents),t.name) from public.sb_event_tiers t where t.event_id=p_event),'[]'::jsonb));
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
  values(p_event,p_tier,'Door sale · cash','bookings@theticketbunker.com',p_quantity,coalesce(t.door_price_cents,t.price_cents)*p_quantity,'paid',now(),e.currency,now(),p_request,'cash',p_actor) returning * into r;
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
 if coalesce(t.door_price_cents,t.price_cents)<=0 then raise exception 'This ticket type is free';end if;
 insert into public.sb_event_orders(event_id,tier_id,customer_name,customer_email,quantity,total_cents,reserved_until,currency,tb_checkout_key,tb_payment_flow,door_sale,door_seller)
 values(p_event,p_tier,'Door sale · card','bookings@theticketbunker.com',p_quantity,coalesce(t.door_price_cents,t.price_cents)*p_quantity,now()+interval '35 minutes',e.currency,p_request,'separate_v1','card',p_actor) returning * into r;
 return r;
end;$$;
