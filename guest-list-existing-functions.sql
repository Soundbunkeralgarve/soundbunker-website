
CREATE OR REPLACE FUNCTION public.sb_confirm_event_order(p_order uuid, p_session text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.sb_event_orders; cap integer; used_count bigint;
begin
 select * into o from public.sb_event_orders where id=p_order;
 if not found then raise exception 'Event order not found'; end if;
 select quantity_total into cap from public.sb_event_tiers where id=o.tier_id for update;
 select * into o from public.sb_event_orders where id=p_order for update;
 if o.status='paid' then
   if o.stripe_session_id=p_session then return 'paid'; end if;
   raise exception 'Session mismatch';
 end if;
 if o.status<>'reserved' or (o.stripe_session_id is not null and o.stripe_session_id<>p_session)
 then raise exception 'Order not reservable'; end if;
 select coalesce(sum(quantity),0) into used_count from public.sb_event_orders
 where tier_id=o.tier_id and id<>o.id and
 (status='paid' or status='needs_attention' or (status='reserved' and reserved_until>now()));
 if used_count+public.sb_guest_reserved(o.tier_id)+o.quantity>cap then
   update public.sb_event_orders set status='needs_attention',stripe_session_id=p_session where id=o.id;
   return 'needs_attention';
 end if;
 update public.sb_event_orders set status='paid',stripe_session_id=p_session,paid_at=now() where id=o.id;
 insert into public.sb_event_tickets(order_id,event_id,tier_id,sequence_number)
 select o.id,o.event_id,o.tier_id,n from generate_series(1,o.quantity) as n
 on conflict (order_id,sequence_number) do nothing;
 return 'paid';
end $function$
;

create or replace function public.sb_event_inventory() returns table(tier_id uuid,used_count bigint) language sql stable security invoker set search_path='' as $$
select t.id,coalesce((select sum(o.quantity) from public.sb_event_orders o join public.sb_events e on e.id=o.event_id where o.tier_id=t.id and (o.status in ('paid','needs_attention') or (o.status='reserved' and o.reserved_until>now())) and (not o.beta_test_order or (e.public_beta_test and e.beta_test_expires_at>now()))),0)::bigint+public.sb_guest_reserved(t.id) from public.sb_event_tiers t
$$;;

CREATE OR REPLACE FUNCTION public.sb_reserve_event_tickets(p_tier uuid, p_name text, p_email text, p_quantity integer)
 RETURNS sb_event_orders
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t record; used_count bigint; created public.sb_event_orders;
begin
 if p_quantity is null or p_quantity<1 or p_quantity>8 then raise exception 'Invalid ticket quantity'; end if;
 select t0.id,t0.event_id,t0.price_cents,t0.quantity_total,e.starts_at,e.status,e.currency
 into t from public.sb_event_tiers t0 join public.sb_events e on e.id=t0.event_id
 where t0.id=p_tier for update of t0;
 if not found or t.status<>'published' or t.starts_at<=now() then raise exception 'Tickets unavailable'; end if;
 select coalesce(sum(quantity),0) into used_count from public.sb_event_orders
 where tier_id=p_tier and (status='paid' or (status='reserved' and reserved_until>now()) or status='needs_attention');
 if used_count+public.sb_guest_reserved(p_tier)+p_quantity>t.quantity_total then raise exception 'Not enough tickets remaining'; end if;
 insert into public.sb_event_orders(event_id,tier_id,customer_name,customer_email,quantity,total_cents,reserved_until,currency)
 values(t.event_id,p_tier,p_name,p_email,p_quantity,t.price_cents*p_quantity,now()+interval '35 minutes',t.currency)
 returning * into created;
 return created;
end $function$
;

CREATE OR REPLACE FUNCTION public.sb_free_test_value_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE good boolean;
BEGIN
 IF TG_TABLE_NAME='sb_event_tiers' THEN
  IF NEW.price_cents=0 THEN
   SELECT e.internal_free_test AND e.test_expires_at>now()
    INTO good FROM public.sb_events e WHERE e.id=NEW.event_id;
   IF NOT coalesce(good,false) OR NEW.quantity_total>20
   THEN RAISE EXCEPTION 'Free price is restricted to an active internal test event of at most 20 tickets'; END IF;
  END IF;
 ELSE
  IF NEW.guest_allocation_id IS NOT NULL THEN
   IF NEW.total_cents<>0 OR NEW.quantity<>1 OR NEW.beta_test_order OR NOT EXISTS(SELECT 1 FROM public.sb_guest_allocations a WHERE a.id=NEW.guest_allocation_id AND a.event_id=NEW.event_id AND a.tier_id=NEW.tier_id) THEN RAISE EXCEPTION 'Invalid guest order'; END IF;
   RETURN NEW;
  END IF;
  IF NEW.total_cents=0 THEN
   SELECT (e.internal_free_test AND tt.price_cents=0 AND e.id=tt.event_id)
    OR (e.public_beta_test AND e.status='draft' AND
        e.beta_test_expires_at>now() AND tt.price_cents>=100 AND
        e.id=tt.event_id)
   INTO good FROM public.sb_events e JOIN public.sb_event_tiers tt ON tt.event_id=e.id
    WHERE e.id=NEW.event_id AND tt.id=NEW.tier_id;
   IF NOT coalesce(good,false)
   THEN RAISE EXCEPTION 'Zero-value orders require a valid test-only event'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.sb_checkin_event_ticket(p_ticket uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE t record;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Scanner identity required'; END IF;
 SELECT tk.id,tk.event_id,tk.checked_in_at,e.title,e.starts_at,e.status,
        e.public_beta_test,e.beta_test_expires_at,o.status order_status,o.guest_allocation_id,o.beta_test_order,tt.name tier_name
 INTO t FROM public.sb_event_tickets tk
 JOIN public.sb_events e ON e.id=tk.event_id
 JOIN public.sb_event_tiers tt ON tt.id=tk.tier_id
 JOIN public.sb_event_orders o ON o.id=tk.order_id
 WHERE tk.id=p_ticket FOR UPDATE OF tk;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.role='admin')
    AND NOT EXISTS(SELECT 1 FROM public.sb_event_staff_access s
     WHERE s.event_id=t.event_id AND s.user_id=p_actor AND s.revoked_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM public.sb_events e JOIN public.sb_event_organisers org
     ON org.id=e.organiser_profile_id WHERE e.id=t.event_id AND org.owner_user_id=p_actor)
 THEN RAISE EXCEPTION 'Staff access denied for this event'; END IF;
 IF t.order_status<>'paid' THEN RETURN jsonb_build_object('status','invalid','message','Ticket cancelled or refunded'); END IF;
 IF t.checked_in_at IS NOT NULL
 THEN RETURN jsonb_build_object('status','used','checked_in_at',t.checked_in_at,'event',t.title); END IF;
 IF t.beta_test_order AND NOT (t.public_beta_test AND t.status='draft'
   AND t.beta_test_expires_at>now())
 THEN RETURN jsonb_build_object('status','not_open','event',t.title,'message','Software test is no longer active'); END IF;
 IF NOT ((t.status='published' AND now()>=t.starts_at-interval '18 hours'
       AND now()<=t.starts_at+interval '36 hours')
       OR (t.public_beta_test AND t.status='draft' AND t.beta_test_expires_at>now()))
 THEN RETURN jsonb_build_object('status','not_open','event',t.title); END IF;
 UPDATE public.sb_event_tickets SET checked_in_at=now(),checked_in_by=p_actor
 WHERE id=p_ticket AND checked_in_at IS NULL;
 RETURN jsonb_build_object('status','valid','event',t.title,'tier',case when t.guest_allocation_id is not null then 'Guest list · '||t.tier_name else t.tier_name end,
  'beta_test',coalesce(t.public_beta_test,false));
END $function$
;

CREATE OR REPLACE FUNCTION ticketbunker_private.generate_due_reports()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare ev record; inserted integer:=0;
begin
 for ev in select e.* from public.sb_events e
  where e.status='published' and not e.internal_free_test and not e.public_beta_test
    and e.ends_at is not null and e.ends_at + interval '12 hours' <= now()
    and not exists(select 1 from public.tb_event_reports r where r.event_id=e.id)
  order by e.ends_at limit 100
 loop
  insert into public.tb_event_reports(event_id,due_at,event_title,currency,ends_at,sold_tickets,gross_cents,refunded_order_cents,checked_in,not_scanned,scanner_summary,tier_summary)
  select ev.id,ev.ends_at+interval '12 hours',ev.title,ev.currency,ev.ends_at,
   coalesce((select sum(quantity) from public.sb_event_orders where event_id=ev.id and status in ('paid','refunded') and not beta_test_order and guest_allocation_id is null),0),
   coalesce((select sum(total_cents) from public.sb_event_orders where event_id=ev.id and status in ('paid','refunded') and not beta_test_order and guest_allocation_id is null),0),
   coalesce((select sum(total_cents) from public.sb_event_orders where event_id=ev.id and status='refunded' and not beta_test_order and guest_allocation_id is null),0),
   (select count(*) from public.sb_event_tickets t join public.sb_event_orders o on o.id=t.order_id where t.event_id=ev.id and o.status='paid' and not o.beta_test_order and o.guest_allocation_id is null and t.checked_in_at is not null),
   (select count(*) from public.sb_event_tickets t join public.sb_event_orders o on o.id=t.order_id where t.event_id=ev.id and o.status='paid' and not o.beta_test_order and o.guest_allocation_id is null and t.checked_in_at is null),
   coalesce((select jsonb_agg(to_jsonb(sc)) from (select coalesce(p.full_name,'Scanner') as name,count(*) as scans from public.sb_event_tickets t join public.sb_event_orders o on o.id=t.order_id left join public.profiles p on p.id=t.checked_in_by where t.event_id=ev.id and o.status='paid' and not o.beta_test_order and o.guest_allocation_id is null and t.checked_in_at is not null group by t.checked_in_by,p.full_name)sc),'[]'::jsonb),
   coalesce((select jsonb_agg(to_jsonb(tt)) from (select tier.name,coalesce(sum(o.quantity),0) as sold,coalesce(sum(o.total_cents),0) as gross_cents from public.sb_event_tiers tier left join public.sb_event_orders o on o.tier_id=tier.id and o.status in ('paid','refunded') and not o.beta_test_order and o.guest_allocation_id is null where tier.event_id=ev.id group by tier.id,tier.name)tt),'[]'::jsonb)
  on conflict(event_id) do nothing;
  if found then inserted:=inserted+1;end if;
  insert into public.tb_event_settlements(event_id)values(ev.id)on conflict do nothing;
 end loop;
 return inserted;
end $function$
;

