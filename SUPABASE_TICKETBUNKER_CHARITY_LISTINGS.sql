-- ticketBunker: free event listing for verified registered charities.
-- Supplying a registration number starts manual review; it NEVER waives fees by itself.
CREATE TABLE IF NOT EXISTS public.sb_event_charity_claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL UNIQUE REFERENCES public.sb_events(id) ON DELETE CASCADE,
 organiser_profile_id uuid NOT NULL REFERENCES public.sb_event_organisers(id),
 country_code text NOT NULL CHECK(country_code IN ('PT','GB')),
 registration_number text NOT NULL CHECK (
  char_length(registration_number) BETWEEN 3 AND 40 AND
  registration_number ~ '^[A-Za-z0-9][A-Za-z0-9 .\/-]*$'
 ),
 status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','verified','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by uuid REFERENCES auth.users(id),
 reviewer_notes text,
 CHECK (status<>'verified' OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS sb_event_charity_status_idx ON public.sb_event_charity_claims(status,created_at DESC);
ALTER TABLE public.sb_event_charity_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sb_event_charity_claims FROM public,anon,authenticated;
GRANT ALL ON public.sb_event_charity_claims TO service_role;

CREATE OR REPLACE FUNCTION public.sb_event_charity_claim_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM public.sb_events e
  WHERE e.id=new.event_id AND e.organiser_profile_id=new.organiser_profile_id
    AND e.country_code=new.country_code
 ) THEN RAISE EXCEPTION 'Charity registration must match event and organiser'; END IF;
 IF tg_op='UPDATE' AND old.status='verified' AND
   (new.registration_number IS DISTINCT FROM old.registration_number OR
    new.organiser_profile_id IS DISTINCT FROM old.organiser_profile_id OR
    new.event_id IS DISTINCT FROM old.event_id)
 THEN RAISE EXCEPTION 'A verified charity registration cannot be changed'; END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS sb_event_charity_claim_guard_trg ON public.sb_event_charity_claims;
CREATE TRIGGER sb_event_charity_claim_guard_trg
 BEFORE INSERT OR UPDATE ON public.sb_event_charity_claims
 FOR EACH ROW EXECUTE FUNCTION public.sb_event_charity_claim_guard();
REVOKE ALL ON FUNCTION public.sb_event_charity_claim_guard() FROM public,anon,authenticated;

-- Keep organiser approval, tax/KYC, Stripe account and payment capabilities mandatory
-- even when the ticketBunker event LISTING fee is waived for a verified charity.
CREATE OR REPLACE FUNCTION public.sb_event_publish_controls()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE organiser record;
BEGIN
 IF old.organiser_profile_id IS DISTINCT FROM new.organiser_profile_id
   AND old.status<>'draft'
 THEN RAISE EXCEPTION 'Cannot change event merchant after publishing'; END IF;
 IF old.status='published'
   AND (old.currency<>new.currency OR old.country_code<>new.country_code OR
        old.venue_timezone<>new.venue_timezone OR old.starts_at<>new.starts_at)
 THEN RAISE EXCEPTION 'Cannot change financial or admission details of a published event'; END IF;
 IF new.organiser_profile_id IS NOT NULL AND new.status='published' AND old.status<>'published' THEN
   SELECT status,stripe_account_id,stripe_capabilities_ready,tax_review_complete
   INTO organiser FROM public.sb_event_organisers WHERE id=new.organiser_profile_id;
   IF NOT FOUND OR organiser.status<>'approved' OR organiser.stripe_account_id IS NULL
     OR NOT organiser.stripe_capabilities_ready OR NOT organiser.tax_review_complete
   THEN RAISE EXCEPTION 'Organiser approval, tax review and Stripe connection required'; END IF;
   IF NOT EXISTS(
     SELECT 1 FROM public.sb_event_listing_fees f WHERE f.event_id=new.id
       AND f.organiser_profile_id=new.organiser_profile_id AND f.status='paid'
   ) AND NOT EXISTS (
     SELECT 1 FROM public.sb_event_charity_claims c WHERE c.event_id=new.id
       AND c.organiser_profile_id=new.organiser_profile_id
       AND c.country_code=new.country_code AND c.status='verified'
   ) THEN RAISE EXCEPTION 'Paid listing or verified charity listing exemption required'; END IF;
 END IF;
 RETURN new;
END $$;
REVOKE ALL ON FUNCTION public.sb_event_publish_controls() FROM public,anon,authenticated;
