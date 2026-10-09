-- ticketBunker beta: request a premium homepage feature without accepting payment.
-- A listing can only become a paid featured placement after review and a future verified checkout.
CREATE TABLE IF NOT EXISTS public.sb_event_showcase_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL UNIQUE REFERENCES public.sb_events(id) ON DELETE CASCADE,
 organiser_profile_id uuid NOT NULL REFERENCES public.sb_event_organisers(id),
 status text NOT NULL DEFAULT 'requested'
   CHECK(status IN ('requested','approved','payment_pending','paid','scheduled','live','declined','cancelled')),
 currency text NOT NULL CHECK(currency IN ('gbp','eur')),
 proposed_amount_cents integer NOT NULL CHECK(proposed_amount_cents>0),
 requested_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 notes text NOT NULL DEFAULT '',
 stripe_session_id text UNIQUE,
 paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS sb_event_showcase_status_idx ON public.sb_event_showcase_requests(status,requested_at DESC);
ALTER TABLE public.sb_event_showcase_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sb_event_showcase_requests FROM public,anon,authenticated;
GRANT ALL ON public.sb_event_showcase_requests TO service_role;

CREATE OR REPLACE FUNCTION public.sb_feature_request_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.sb_events e
   WHERE e.id=new.event_id AND e.organiser_profile_id=new.organiser_profile_id AND e.currency=new.currency)
 THEN RAISE EXCEPTION 'Showcase request must match the organiser and event currency'; END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS sb_feature_request_guard_trigger ON public.sb_event_showcase_requests;
CREATE TRIGGER sb_feature_request_guard_trigger
 BEFORE INSERT OR UPDATE ON public.sb_event_showcase_requests
 FOR EACH ROW EXECUTE FUNCTION public.sb_feature_request_guard();
REVOKE ALL ON FUNCTION public.sb_feature_request_guard() FROM public,anon,authenticated;
