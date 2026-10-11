-- Event Plus requests must be owned, private, 501-2,000 capacity, correctly priced, unpaid.
BEGIN;
DO $$
DECLARE actor uuid:=gen_random_uuid(); promoter uuid; ev uuid; small uuid; item uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);
 INSERT INTO public.sb_event_organisers(owner_user_id,display_name,country_code)
 VALUES(actor,'Event Plus organiser','PT') RETURNING id INTO promoter;
 INSERT INTO public.sb_events(slug,title,organiser_profile_id,starts_at,country_code,venue_timezone,currency,status)
 VALUES('eventplus-test-'||substr(gen_random_uuid()::text,1,8),'Event Plus test',
 promoter,now()+interval '14 days','PT','Europe/Lisbon','eur','draft') RETURNING id INTO ev;
 INSERT INTO public.sb_event_tiers(event_id,name,price_cents,quantity_total)
 VALUES(ev,'General admission',1000,550);
 INSERT INTO public.sb_event_payment_terms_requests(event_id,organiser_profile_id,ticket_capacity,currency,payment_preference,proposed_listing_fee_cents)
 VALUES(ev,promoter,550,'eur','deposit_sales',23900) RETURNING id INTO item;
 IF NOT EXISTS(SELECT 1 FROM public.sb_event_payment_terms_requests
 WHERE id=item AND status='requested' AND payment_preference='deposit_sales') THEN
  RAISE EXCEPTION 'Flexible Event Plus request not saved';
 END IF;
 BEGIN
  UPDATE public.sb_event_payment_terms_requests SET proposed_listing_fee_cents=11900 WHERE id=item;
  RAISE EXCEPTION 'Incorrect Event Plus fee accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Incorrect Event Plus fee accepted' THEN RAISE; END IF;
 END;
 INSERT INTO public.sb_events(slug,title,organiser_profile_id,starts_at,country_code,venue_timezone,currency,status)
 VALUES('starter-test-'||substr(gen_random_uuid()::text,1,8),'Starter test',
 promoter,now()+interval '14 days','PT','Europe/Lisbon','eur','draft') RETURNING id INTO small;
 INSERT INTO public.sb_event_tiers(event_id,name,price_cents,quantity_total)
 VALUES(small,'General admission',1000,100);
 BEGIN
  INSERT INTO public.sb_event_payment_terms_requests(event_id,organiser_profile_id,ticket_capacity,currency,payment_preference,proposed_listing_fee_cents)
  VALUES(small,promoter,100,'eur','deposit_sales',23900);
  RAISE EXCEPTION 'Starter was permitted flexible terms';
 EXCEPTION WHEN raise_exception OR check_violation THEN
  IF SQLERRM='Starter was permitted flexible terms' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.sb_event_listing_fees WHERE event_id=ev)
 THEN RAISE EXCEPTION 'Flexible terms caused listing payment without approval'; END IF;
 IF EXISTS(SELECT 1 FROM public.sb_events WHERE id=ev AND status<>'draft')
 THEN RAISE EXCEPTION 'Flexible terms published draft without payment'; END IF;
END $$;
ROLLBACK;
