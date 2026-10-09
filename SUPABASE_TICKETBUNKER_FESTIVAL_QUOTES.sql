-- Five ticketBunker tiers, bespoke Festival + Festival Pro deals.
-- Every bespoke request is an expression of interest, NEVER a payment authorisation.
ALTER TABLE public.sb_event_listing_fees DROP CONSTRAINT IF EXISTS sb_event_listing_fees_tier_code_check;
ALTER TABLE public.sb_event_listing_fees ADD CONSTRAINT sb_event_listing_fees_tier_code_check
 CHECK (tier_code IN ('starter','standard','event_plus','festival','festival_pro'));

CREATE TABLE IF NOT EXISTS public.sb_event_festival_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL UNIQUE REFERENCES public.sb_events(id) ON DELETE CASCADE,
 organiser_profile_id uuid NOT NULL REFERENCES public.sb_event_organisers(id),
 tier_code text NOT NULL CHECK(tier_code IN ('festival','festival_pro')),
 expected_tickets integer NOT NULL CHECK(expected_tickets>=2001),
 currency text NOT NULL CHECK(currency IN ('gbp','eur')),
 event_details text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'requested'
  CHECK(status IN ('requested','in_review','quoted','accepted','declined','cancelled')),
 quoted_amount_cents integer CHECK(quoted_amount_cents IS NULL OR quoted_amount_cents>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((tier_code='festival' AND expected_tickets BETWEEN 2001 AND 5000)
       OR (tier_code='festival_pro' AND expected_tickets>=5001))
);
CREATE INDEX IF NOT EXISTS sb_festival_quotes_status_idx
 ON public.sb_event_festival_quotes(status,created_at DESC);
ALTER TABLE public.sb_event_festival_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sb_event_festival_quotes FROM public,anon,authenticated;
GRANT ALL ON public.sb_event_festival_quotes TO service_role;

CREATE OR REPLACE FUNCTION public.sb_festival_quote_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.sb_events e WHERE e.id=new.event_id
   AND e.organiser_profile_id=new.organiser_profile_id AND e.currency=new.currency
 ) THEN RAISE EXCEPTION 'Festival quote must match the event owner and currency'; END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS sb_festival_quote_guard_trigger ON public.sb_event_festival_quotes;
CREATE TRIGGER sb_festival_quote_guard_trigger
 BEFORE INSERT OR UPDATE ON public.sb_event_festival_quotes
 FOR EACH ROW EXECUTE FUNCTION public.sb_festival_quote_guard();
REVOKE ALL ON FUNCTION public.sb_festival_quote_guard() FROM public,anon,authenticated;
