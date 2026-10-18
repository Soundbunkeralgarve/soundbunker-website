-- Add only the owner-approved listing waiver; preserve all existing identity, admission and verification guards.
CREATE OR REPLACE FUNCTION public.sb_event_publish_controls()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE organiser record;
BEGIN
 IF OLD.internal_free_test IS DISTINCT FROM NEW.internal_free_test
   OR OLD.test_code_hash IS DISTINCT FROM NEW.test_code_hash
 THEN RAISE EXCEPTION 'Cannot change test-event identity after event creation'; END IF;
 IF OLD.organiser_profile_id IS DISTINCT FROM NEW.organiser_profile_id
   AND OLD.status<>'draft'
 THEN RAISE EXCEPTION 'Cannot change event merchant after publishing'; END IF;
 IF OLD.status='published'
   AND (OLD.currency<>NEW.currency OR OLD.country_code<>NEW.country_code OR
        OLD.venue_timezone<>NEW.venue_timezone OR OLD.starts_at<>NEW.starts_at)
 THEN RAISE EXCEPTION 'Cannot change financial or admission details of a published event'; END IF;
 IF NEW.status='published' AND OLD.status<>'published' THEN
   IF NEW.internal_free_test THEN
    IF NEW.test_expires_at<=now() OR NEW.test_expires_at>now()+interval '72 hours'
       OR NEW.starts_at<=now() OR NEW.starts_at>now()+interval '18 hours'
    THEN RAISE EXCEPTION 'Internal test must be short-lived and close to its event date'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sb_event_tiers
       WHERE event_id=NEW.id AND price_cents=0 AND quantity_total<=20)
    THEN RAISE EXCEPTION 'Create a short-lived free test tier before publishing'; END IF;
   ELSIF NEW.organiser_profile_id IS NOT NULL THEN
    SELECT status,stripe_account_id,stripe_capabilities_ready,tax_review_complete
      INTO organiser FROM public.sb_event_organisers WHERE id=NEW.organiser_profile_id;
    IF NOT FOUND OR organiser.status<>'approved' OR organiser.stripe_account_id IS NULL
       OR NOT organiser.stripe_capabilities_ready OR NOT organiser.tax_review_complete
    THEN RAISE EXCEPTION 'Organiser approval, tax review and Stripe connection required'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sb_event_listing_fees f
      WHERE f.event_id=NEW.id AND f.organiser_profile_id=NEW.organiser_profile_id AND f.status='paid')
     AND NOT EXISTS (SELECT 1 FROM public.sb_event_charity_claims c
       WHERE c.event_id=NEW.id AND c.organiser_profile_id=NEW.organiser_profile_id
         AND c.country_code=NEW.country_code AND c.status='verified')
     AND NOT EXISTS (SELECT 1 FROM public.tb_client_controls cc WHERE cc.organiser_id=NEW.organiser_profile_id AND cc.listing_discount_percent=100 AND (cc.valid_until IS NULL OR cc.valid_until>now()) AND (SELECT coalesce(sum(quantity_total),0) FROM public.sb_event_tiers WHERE event_id=NEW.id)<=2000)
    THEN RAISE EXCEPTION 'Paid listing or approved listing exemption required'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END $function$
;
REVOKE ALL ON FUNCTION public.sb_event_publish_controls() FROM public,anon,authenticated;

