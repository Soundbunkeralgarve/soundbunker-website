-- A private €0 test event that started days ago still admits once while its test window is open.
BEGIN;
DO $$
DECLARE e uuid; tier uuid; actor uuid; o uuid; ticket uuid; late_ticket uuid; scan jsonb;
BEGIN
 actor:=gen_random_uuid();
 INSERT INTO auth.users(id) VALUES(actor);
 INSERT INTO public.profiles(id,role) VALUES(actor,'admin') ON CONFLICT(id) DO UPDATE SET role='admin';
 INSERT INTO public.sb_events(slug,title,description,starts_at,status,internal_free_test,test_code_hash,test_expires_at)
 VALUES('review-demo-qa-'||substr(gen_random_uuid()::text,1,8),'Review Demo','Private test.',
  now()-interval '10 days','draft',true,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),now()+interval '30 days')
 RETURNING id INTO e;
 INSERT INTO public.sb_event_tiers(event_id,name,price_cents,quantity_total) VALUES(e,'FREE TEST',0,20) RETURNING id INTO tier;
 INSERT INTO public.sb_event_orders(event_id,tier_id,customer_name,customer_email,quantity,total_cents,status,reserved_until,paid_at)
 VALUES(e,tier,'Demo Guest','demo@example.test',2,0,'paid',now(),now()) RETURNING id INTO o;
 INSERT INTO public.sb_event_tickets(order_id,event_id,tier_id,sequence_number) VALUES(o,e,tier,1) RETURNING id INTO ticket;
 INSERT INTO public.sb_event_tickets(order_id,event_id,tier_id,sequence_number) VALUES(o,e,tier,2) RETURNING id INTO late_ticket;
 -- Publishing rules only allow a test event close to its start, so simulate one published days ago.
 SET LOCAL session_replication_role=replica;
 UPDATE public.sb_events SET status='published' WHERE id=e;
 SET LOCAL session_replication_role=origin;
 SELECT public.sb_checkin_event_ticket_versioned(ticket,actor,0) INTO scan;
 IF scan->>'status'<>'valid' THEN RAISE EXCEPTION 'Open test event refused a first scan: %',scan; END IF;
 SELECT public.sb_checkin_event_ticket_versioned(ticket,actor,0) INTO scan;
 IF scan->>'status'<>'used' THEN RAISE EXCEPTION 'Second scan was not reported as used: %',scan; END IF;
 SET LOCAL session_replication_role=replica;
 UPDATE public.sb_events SET test_expires_at=now()-interval '1 minute' WHERE id=e;
 SET LOCAL session_replication_role=origin;
 SELECT public.sb_checkin_event_ticket_versioned(late_ticket,actor,0) INTO scan;
 IF scan->>'status'<>'not_open' THEN RAISE EXCEPTION 'Expired test event admitted a ticket: %',scan; END IF;
END $$;
ROLLBACK;
