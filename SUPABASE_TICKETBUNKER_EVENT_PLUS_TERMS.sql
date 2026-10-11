-- Event Plus (501-2,000 ticket allocation) may request flexible listing-fee terms.
-- This is an enquiry only, not a Stripe debit authorisation, payment, or publication.
CREATE TABLE IF NOT EXISTS public.sb_event_payment_terms_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL UNIQUE REFERENCES public.sb_events(id) ON DELETE CASCADE,
 organiser_profile_id uuid NOT NULL REFERENCES public.sb_event_organisers(id),
 ticket_capacity integer NOT NULL CHECK(ticket_capacity BETWEEN 501 AND 2000),
 currency text NOT NULL CHECK(currency IN ('gbp','eur')),
 payment_preference text NOT NULL CHECK(payment_preference='deposit_sales'),
 proposed_listing_fee_cents integer NOT NULL CHECK(proposed_listing_fee_cents IN (19900,23900)),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','in_review','approved','declined','cancelled')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1200),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sb_event_payment_terms_status_idx
 ON public.sb_event_payment_terms_requests(status,created_at DESC);
ALTER TABLE public.sb_event_payment_terms_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sb_event_payment_terms_requests FROM public,anon,authenticated;
GRANT ALL ON public.sb_event_payment_terms_requests TO service_role;

-- Verify event ownership, currency, a matching fee and a non-test draft.
CREATE OR REPLACE FUNCTION public.sb_event_payment_terms_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ev record; capacity bigint;
BEGIN
 SELECT id,currency,organiser_profile_id,status,internal_free_test
 INTO ev FROM public.sb_events WHERE id=new.event_id;
 IF NOT FOUND OR ev.organiser_profile_id IS DISTINCT FROM new.organiser_profile_id
    OR ev.currency IS DISTINCT FROM new.currency OR ev.status <> 'draft'
    OR ev.internal_free_test THEN
  RAISE EXCEPTION 'Flexible payment terms require an ordinary draft event owned by the organiser';
 END IF;
 SELECT COALESCE(sum(quantity_total),0) INTO capacity
 FROM public.sb_event_tiers WHERE event_id=new.event_id;
 IF capacity<>new.ticket_capacity OR capacity<501 OR capacity>2000 THEN
  RAISE EXCEPTION 'Flexible listing terms are available only for Event Plus (501-2,000 tickets)';
 END IF;
 IF (new.currency='gbp' AND new.proposed_listing_fee_cents<>19900)
    OR (new.currency='eur' AND new.proposed_listing_fee_cents<>23900) THEN
  RAISE EXCEPTION 'Listing-fee amount does not match Event Plus';
 END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS sb_event_payment_terms_guard_trg ON public.sb_event_payment_terms_requests;
CREATE TRIGGER sb_event_payment_terms_guard_trg
 BEFORE INSERT OR UPDATE OF event_id,organiser_profile_id,ticket_capacity,currency,proposed_listing_fee_cents
 ON public.sb_event_payment_terms_requests FOR EACH ROW EXECUTE FUNCTION public.sb_event_payment_terms_guard();
REVOKE ALL ON FUNCTION public.sb_event_payment_terms_guard() FROM public,anon,authenticated;
