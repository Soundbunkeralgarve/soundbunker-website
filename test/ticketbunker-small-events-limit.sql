DO $$
DECLARE e uuid; id1 uuid; id2 uuid; msg text;
BEGIN
 INSERT INTO public.sb_events(slug,title,starts_at)
 VALUES('small-event-2k-limit-test','Small event capacity',now()+interval '2 days') RETURNING id INTO e;
 INSERT INTO public.sb_event_tiers(event_id,name,price_cents,quantity_total)
 VALUES(e,'General',2000,1000) RETURNING id INTO id1;
 INSERT INTO public.sb_event_tiers(event_id,name,price_cents,quantity_total)
 VALUES(e,'VIP',5000,1000) RETURNING id INTO id2;
 BEGIN
  INSERT INTO public.sb_event_tiers(event_id,name,price_cents,quantity_total)
  VALUES(e,'Overflow',3000,1);
  RAISE EXCEPTION 'Tier cap failed';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg='Tier cap failed' THEN RAISE; END IF;
  IF msg NOT LIKE '%2,000%' THEN RAISE EXCEPTION 'Unexpected cap error: %',msg; END IF;
 END;
 BEGIN
  UPDATE public.sb_event_tiers SET quantity_total=1001 WHERE id=id1;
  RAISE EXCEPTION 'Tier update cap failed';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
  IF msg='Tier update cap failed' THEN RAISE; END IF;
  IF msg NOT LIKE '%2,000%' THEN RAISE EXCEPTION 'Unexpected update error: %',msg; END IF;
 END;
END $$;
