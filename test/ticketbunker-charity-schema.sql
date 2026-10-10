DO $$
DECLARE owner_id uuid:=gen_random_uuid(); org_id uuid; v_event_id uuid; claim_id uuid; message text;
BEGIN
 INSERT INTO auth.users(id) VALUES(owner_id);
 INSERT INTO public.sb_event_organisers(owner_user_id,display_name,country_code,status,stripe_account_id,stripe_capabilities_ready,tax_review_complete)
 VALUES(owner_id,'Charity organiser','GB','approved','acct_test_charity',true,true) RETURNING id INTO org_id;
 INSERT INTO public.sb_events(slug,title,organiser_profile_id,starts_at,country_code,venue_timezone,currency)
 VALUES('charity-event-test','Charity Benefit Night',org_id,now()+interval '5 days','GB','Europe/London','gbp')
 RETURNING id INTO v_event_id;
 INSERT INTO public.sb_event_charity_claims(event_id,organiser_profile_id,country_code,registration_number)
 VALUES(v_event_id,org_id,'GB','SC012345') RETURNING id INTO claim_id;
 IF NOT EXISTS (SELECT 1 FROM public.sb_event_charity_claims WHERE id=claim_id AND status='pending_review')
 THEN RAISE EXCEPTION 'Charity verification was bypassed'; END IF;
 BEGIN
  UPDATE public.sb_events SET status='published' WHERE id=v_event_id;
  RAISE EXCEPTION 'Unverified charity event incorrectly published';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message='Unverified charity event incorrectly published' THEN RAISE; END IF;
  IF message NOT LIKE '%verified charity%' THEN RAISE EXCEPTION 'Unexpected publish error: %',message; END IF;
 END;
 UPDATE public.sb_event_charity_claims SET status='verified',reviewed_at=now(),reviewed_by=owner_id WHERE id=claim_id;
 UPDATE public.sb_events SET status='published' WHERE id=v_event_id;
 IF NOT EXISTS (SELECT 1 FROM public.sb_events WHERE id=v_event_id AND status='published')
 THEN RAISE EXCEPTION 'Verified free listing failed to publish'; END IF;
 IF EXISTS(SELECT 1 FROM public.sb_event_listing_fees WHERE event_id=v_event_id)
 THEN RAISE EXCEPTION 'A charity was charged a listing fee'; END IF;
 BEGIN
  UPDATE public.sb_event_charity_claims SET registration_number='CHANGED' WHERE id=claim_id;
  RAISE EXCEPTION 'Verified charity registration changed';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message='Verified charity registration changed' THEN RAISE; END IF;
  IF message NOT LIKE '%cannot be changed%' THEN RAISE EXCEPTION 'Unexpected update error: %',message; END IF;
 END;
END $$;
