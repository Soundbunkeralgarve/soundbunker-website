DO $$
DECLARE buyer_id uuid:=gen_random_uuid(); promoter uuid; e uuid; q uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(buyer_id);
 INSERT INTO public.sb_event_organisers(owner_user_id,display_name,country_code)
 VALUES(buyer_id,'Festival promoter','GB') RETURNING id INTO promoter;
 INSERT INTO public.sb_events(slug,title,organiser_profile_id,starts_at,country_code,venue_timezone,currency)
 VALUES('bespoke-festival-test','Custom Festival',promoter,now()+interval '35 days','GB','Europe/London','gbp')
 RETURNING id INTO e;
 INSERT INTO public.sb_event_festival_quotes(event_id,organiser_profile_id,tier_code,expected_tickets,currency,event_details)
 VALUES(e,promoter,'festival',3400,'gbp','Multi-day independent event') RETURNING id INTO q;
 IF NOT EXISTS(SELECT 1 FROM public.sb_event_festival_quotes
   WHERE id=q AND status='requested' AND quoted_amount_cents IS NULL)
 THEN RAISE EXCEPTION 'Custom quote wrongly charged or pre-priced'; END IF;
 UPDATE public.sb_event_festival_quotes SET tier_code='festival_pro',expected_tickets=5500 WHERE id=q;
 BEGIN
  INSERT INTO public.sb_event_festival_quotes(event_id,organiser_profile_id,tier_code,expected_tickets,currency)
  VALUES(e,promoter,'festival',5600,'gbp');
  RAISE EXCEPTION 'Bad custom quote accepted';
 EXCEPTION WHEN OTHERS THEN
  IF sqlerrm='Bad custom quote accepted' THEN RAISE; END IF;
 END;
 INSERT INTO public.sb_event_listing_fees(event_id,organiser_profile_id,tier_code,amount_cents,currency)
 VALUES(e,promoter,'festival_pro',450000,'gbp');
END $$;
