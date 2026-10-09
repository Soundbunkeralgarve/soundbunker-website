DO $$
DECLARE user_id uuid:=gen_random_uuid(); org_id uuid; ev_id uuid; req_id uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(user_id);
 INSERT INTO public.sb_event_organisers(owner_user_id,display_name,country_code)
 VALUES(user_id,'Test Showcase Organiser','GB') RETURNING id INTO org_id;
 INSERT INTO public.sb_events(slug,title,organiser_profile_id,starts_at,country_code,venue_timezone,currency)
 VALUES('sample-feature','Sample Feature',org_id,now()+interval '20 days','GB','Europe/London','gbp')
 RETURNING id INTO ev_id;
 INSERT INTO public.sb_event_showcase_requests(event_id,organiser_profile_id,currency,proposed_amount_cents)
 VALUES(ev_id,org_id,'gbp',4900) RETURNING id INTO req_id;
 IF NOT EXISTS (SELECT 1 FROM public.sb_event_showcase_requests
 WHERE id=req_id AND status='requested' AND stripe_session_id IS NULL AND paid_at IS NULL)
 THEN RAISE EXCEPTION 'Request incorrectly marked paid'; END IF;
 BEGIN
  INSERT INTO public.sb_event_showcase_requests(event_id,organiser_profile_id,currency,proposed_amount_cents)
  VALUES(ev_id,org_id,'eur',5900);
  RAISE EXCEPTION 'Duplicate or wrong currency request accepted';
 EXCEPTION WHEN OTHERS THEN
  IF sqlerrm='Duplicate or wrong currency request accepted' THEN RAISE; END IF;
 END;
END $$;
