-- Test against a disposable PostgreSQL 17 database ONLY.
do $block$
declare
 eid uuid;
 tid uuid;
 ord public.sb_event_orders;
 ticket_id uuid;
 outcome text;
 scan_result jsonb;
 sold bigint;
 remaining bigint;
begin
 insert into public.sb_events(slug,title,starts_at,status)
 values('qa-test','QA Test Event',now()+interval '3 hours','published') returning id into eid;
 insert into public.sb_event_tiers(event_id,name,price_cents,quantity_total)
 values(eid,'General',2000,2) returning id into tid;
 select * into ord from public.sb_reserve_event_tickets(tid,'Test','test@example.com',2);
 if ord.total_cents<>4000 or ord.quantity<>2 then raise exception 'Reserved order had wrong price or quantity'; end if;
 begin
   perform public.sb_reserve_event_tickets(tid,'Overbook','overbook@example.com',1);
   raise exception 'Overbooking was incorrectly allowed';
 exception when others then
   if sqlerrm='Overbooking was incorrectly allowed' then raise; end if;
 end;
 select public.sb_confirm_event_order(ord.id,'cs_test_valid') into outcome;
 if outcome<>'paid' then raise exception 'Paid checkout was not confirmed'; end if;
 select public.sb_confirm_event_order(ord.id,'cs_test_valid') into outcome;
 if outcome<>'paid' then raise exception 'Paid checkout was not idempotent'; end if;
 select count(*) into sold from public.sb_event_tickets where order_id=ord.id;
 if sold<>2 then raise exception 'Expected exactly two tickets, got %',sold; end if;
 select id into ticket_id from public.sb_event_tickets where order_id=ord.id limit 1;
 select public.sb_checkin_event_ticket(ticket_id,null) into scan_result;
 if scan_result->>'status'<>'valid' then raise exception 'First scan should pass: %',scan_result; end if;
 select public.sb_checkin_event_ticket(ticket_id,null) into scan_result;
 if scan_result->>'status'<>'used' then raise exception 'Second scan must fail: %',scan_result; end if;
 select used_count into remaining from public.sb_event_inventory() where tier_id=tid;
 if remaining<>2 then raise exception 'Inventory aggregation incorrect'; end if;
end $block$;
