-- Public test event end-to-end booking, scan, inventory and paid-price preservation.
BEGIN;
DO $$
DECLARE e uuid; tier uuid; buyer uuid; o uuid; one_ticket uuid; other_ticket uuid; scan jsonb; used bigint;
BEGIN
 buyer:=gen_random_uuid();
 INSERT INTO auth.users(id) VALUES(buyer);
 INSERT INTO public.profiles(id,role) VALUES(buyer,'admin') ON CONFLICT(id) DO UPDATE SET role='admin';
 INSERT INTO public.sb_events(slug,title,description,starts_at,status,public_beta_test,beta_test_expires_at)
 VALUES('public-beta-qa-'||substr(gen_random_uuid()::text,1,8),'Real Tester Event',
  'Full event page and zero-price booking test.',now()+interval '2 days','draft',true,now()+interval '48 hours')
 RETURNING id INTO e;
 INSERT INTO public.sb_event_tiers(event_id,name,price_cents,quantity_total)
 VALUES(e,'VIP',3500,25) RETURNING id INTO tier;
 SELECT public.sb_issue_public_beta_ticket(tier,'Testing Buyer','realbeta@example.test',2) INTO o;
 IF (SELECT count(*) FROM public.sb_event_tickets WHERE order_id=o)<>2
 THEN RAISE EXCEPTION 'Two signed QR records were not created'; END IF;
 IF (SELECT total_cents FROM public.sb_event_orders WHERE id=o)<>0 OR
    NOT (SELECT beta_test_order FROM public.sb_event_orders WHERE id=o) OR
    (SELECT price_cents FROM public.sb_event_tiers WHERE id=tier)<>3500
 THEN RAISE EXCEPTION 'Original 3500 price or zero-value test identity corrupted'; END IF;
 SELECT id INTO one_ticket FROM public.sb_event_tickets WHERE order_id=o ORDER BY sequence_number LIMIT 1;
 SELECT id INTO other_ticket FROM public.sb_event_tickets WHERE order_id=o ORDER BY sequence_number DESC LIMIT 1;
 SELECT public.sb_checkin_event_ticket_versioned(one_ticket,buyer,0) INTO scan;
 IF scan->>'status'<>'valid' THEN RAISE EXCEPTION 'Test QR first scan failed: %',scan; END IF;
 SELECT public.sb_checkin_event_ticket_versioned(one_ticket,buyer,0) INTO scan;
 IF scan->>'status'<>'used' THEN RAISE EXCEPTION 'Duplicate QR scan was accepted: %',scan; END IF;
 BEGIN
  PERFORM public.sb_issue_public_beta_ticket(tier,'Testing Buyer','realbeta@example.test',3);
  RAISE EXCEPTION 'Per-email limit exceeded';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Per-email limit exceeded' THEN RAISE; END IF;
 END;
 UPDATE public.sb_events SET public_beta_test=false,beta_test_expires_at=null WHERE id=e;
 SELECT public.sb_checkin_event_ticket_versioned(other_ticket,buyer,0) INTO scan;
 IF scan->>'status'<>'not_open' THEN RAISE EXCEPTION 'Test QR remained usable after closing %',scan; END IF;
 SELECT used_count INTO used FROM public.sb_event_inventory() WHERE tier_id=tier;
 IF used IS NOT NULL AND used<>0 THEN RAISE EXCEPTION 'Free test consumed paid inventory: %',used; END IF;
 BEGIN
  PERFORM public.sb_issue_public_beta_ticket(tier,'Other Buyer','afterclose@example.test',1);
  RAISE EXCEPTION 'Test booking permitted after closure';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Test booking permitted after closure' THEN RAISE; END IF;
 END;
 IF has_function_privilege('anon','public.sb_issue_public_beta_ticket(uuid,text,text,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'Anonymous database role can mint QR test tickets'; END IF;
END $$;
ROLLBACK;
