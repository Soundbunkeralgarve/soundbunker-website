BEGIN;
DO $$
DECLARE uid uuid:=gen_random_uuid();org uuid; ev uuid; item uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(uid);
 INSERT INTO public.sb_event_organisers(owner_user_id,display_name,country_code)
 VALUES(uid,'Automatic Promo Test','PT') RETURNING id INTO org;
 INSERT INTO public.sb_events(slug,title,organiser_profile_id,starts_at,country_code,venue_timezone,currency)
 VALUES('premium-auto-'||substr(gen_random_uuid()::text,1,8),'Premium Campaign Event',org,now()+interval '7 days',
 'PT','Europe/Lisbon','eur') RETURNING id INTO ev;
 INSERT INTO public.sb_event_showcase_requests(event_id,organiser_profile_id,currency,proposed_amount_cents)
 VALUES(ev,org,'eur',5900) RETURNING id INTO item;
 IF NOT EXISTS(SELECT 1 FROM public.sb_event_showcase_requests WHERE id=item AND premium_email_status='pending')
 THEN RAISE EXCEPTION 'New premium campaign was not pending'; END IF;
 BEGIN
  UPDATE public.sb_event_showcase_requests SET premium_broadcast_id='draft_1',
   premium_email_status='sent',premium_email_sent_at=now() WHERE id=item;
  RAISE EXCEPTION 'Email sent without verified premium payment';
 EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE public.sb_event_showcase_requests SET status='paid',paid_at=now(),
  stripe_session_id='cs_premium_auto_test',premium_broadcast_id='draft_1',
  premium_email_status='sent',premium_email_sent_at=now() WHERE id=item;
 IF NOT EXISTS(SELECT 1 FROM public.sb_event_showcase_requests
   WHERE id=item AND premium_email_status='sent' AND premium_email_sent_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Paid premium campaign could not be recorded'; END IF;
 BEGIN
  UPDATE public.sb_event_showcase_requests SET premium_email_status='sends_repeated'
   WHERE id=item;
  RAISE EXCEPTION 'Invalid campaign status accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
