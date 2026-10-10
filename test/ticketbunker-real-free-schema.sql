-- Postgres integration test for genuine zero-cost, signed-QR-ready test inventory.
BEGIN;
DO $$
DECLARE ev uuid; tier uuid; issued_order uuid; scan jsonb; normal uuid;
BEGIN
 INSERT INTO public.sb_events(slug,title,starts_at,status,internal_free_test,test_code_hash,test_expires_at)
 VALUES('internal-qa-'||substr(gen_random_uuid()::text,1,8),'Internal QR Test',now()+interval '1 hour',
  'draft',true,repeat('a',64),now()+interval '48 hours') RETURNING id INTO ev;
 INSERT INTO public.sb_event_tiers(event_id,name,price_cents,quantity_total)
 VALUES(ev,'Free test',0,20) RETURNING id INTO tier;
 UPDATE public.sb_events SET status='published' WHERE id=ev;
 SELECT public.sb_issue_internal_free_test(ev,'Test Person','qa@example.test',2) INTO issued_order;
 IF (SELECT count(*) FROM public.sb_event_tickets WHERE order_id=issued_order)<>2
 THEN RAISE EXCEPTION 'Expected two genuine test tickets'; END IF;
 IF (SELECT total_cents FROM public.sb_event_orders WHERE id=issued_order)<>0
 THEN RAISE EXCEPTION 'Test ticket must have zero total and no Stripe charge'; END IF;
 SELECT public.sb_checkin_event_ticket((SELECT id FROM public.sb_event_tickets WHERE order_id=order_id ORDER BY sequence_number LIMIT 1),null)
 INTO scan;
 IF scan->>'status'<>'valid' THEN RAISE EXCEPTION 'First QR admission failed %',scan; END IF;
 SELECT public.sb_checkin_event_ticket((SELECT id FROM public.sb_event_tickets WHERE order_id=order_id ORDER BY sequence_number LIMIT 1),null)
 INTO scan;
 IF scan->>'status'<>'used' THEN RAISE EXCEPTION 'Second QR scan not rejected %',scan; END IF;
 BEGIN
  PERFORM public.sb_issue_internal_free_test(ev,'Test Person','qa@example.test',1);
  RAISE EXCEPTION 'Exceeded per-email quota';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Exceeded per-email quota' THEN RAISE; END IF;
 END;
 INSERT INTO public.sb_events(slug,title,starts_at,status)
 VALUES('normal-qa-'||substr(gen_random_uuid()::text,1,8),'Normal paid event',now()+interval '1 hour','draft')
 RETURNING id INTO normal;
 BEGIN
  INSERT INTO public.sb_event_tiers(event_id,name,price_cents,quantity_total)
  VALUES(normal,'Must not be free',0,20);
  RAISE EXCEPTION 'Ordinary event accepted zero-priced tier';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Ordinary event accepted zero-priced tier' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.sb_events WHERE id=ev AND internal_free_test=false)
 THEN RAISE EXCEPTION 'Test flag absent'; END IF;
END $$;
ROLLBACK;