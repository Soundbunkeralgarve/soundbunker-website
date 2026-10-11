BEGIN;
DO $$
DECLARE u uuid:=gen_random_uuid(); org uuid; event uuid; placement uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO public.sb_event_organisers(owner_user_id,display_name,country_code)
 VALUES(u,'Promo QA Organiser','PT') RETURNING id INTO org;
 INSERT INTO public.sb_events(slug,title,organiser_profile_id,starts_at,country_code,venue_timezone,currency)
 VALUES('premium-mail-test-'||substr(gen_random_uuid()::text,1,8),'Premium Placement test',org,now()+interval '10 days','PT','Europe/Lisbon','eur') RETURNING id INTO event;
 INSERT INTO public.sb_event_showcase_requests(event_id,organiser_profile_id,currency,proposed_amount_cents)
 VALUES(event,org,'eur',5900) RETURNING id INTO placement;
 BEGIN
  UPDATE public.sb_event_showcase_requests SET premium_broadcast_id='should-not-exist' WHERE id=placement;
  RAISE EXCEPTION 'Unpaid promo draft was accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE public.sb_event_showcase_requests SET paid_at=now(),stripe_session_id='cs_test_premium_email',
  status='paid',premium_broadcast_id='resend_draft_123' WHERE id=placement;
 IF NOT EXISTS(SELECT 1 FROM public.sb_event_showcase_requests WHERE id=placement AND
  premium_broadcast_id='resend_draft_123' AND paid_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Paid premium mailout cannot be tracked'; END IF;
 UPDATE public.sb_event_showcase_requests SET status='cancelled' WHERE id=placement;
 IF NOT EXISTS(SELECT 1 FROM public.sb_event_showcase_requests WHERE id=placement AND premium_broadcast_id='resend_draft_123')
 THEN RAISE EXCEPTION 'Premium email draft audit was lost on cancellation'; END IF;
END $$;
ROLLBACK;
