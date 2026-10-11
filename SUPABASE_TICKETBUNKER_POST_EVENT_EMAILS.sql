-- TicketBunker: send organiser event reports after the actual end time + 12 hours.
-- No buyer booking data, ticket prices, or checkout flags are changed.
CREATE TABLE IF NOT EXISTS public.sb_event_post_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL UNIQUE REFERENCES public.sb_events(id) ON DELETE CASCADE,
 scheduled_for timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 20),
 claimed_at timestamptz,
 sent_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sb_event_post_reports_due_idx
 ON public.sb_event_post_reports(scheduled_for,attempts)
 WHERE status IN ('pending','failed','sending') AND sent_at IS NULL;
ALTER TABLE public.sb_event_post_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sb_event_post_reports FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.sb_event_post_reports TO service_role;

CREATE OR REPLACE FUNCTION public.sb_queue_post_event_report()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.ends_at IS NOT NULL AND NEW.ends_at > now() AND
  (NEW.status='published' OR NEW.public_beta_test IS TRUE) AND
  NEW.internal_free_test IS NOT TRUE
 THEN
  INSERT INTO public.sb_event_post_reports(event_id,scheduled_for)
   VALUES(NEW.id,NEW.ends_at+interval '12 hours')
  ON CONFLICT(event_id) DO UPDATE SET
   scheduled_for=excluded.scheduled_for,updated_at=now()
  WHERE public.sb_event_post_reports.status IN ('pending','failed')
   AND public.sb_event_post_reports.sent_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sb_event_post_report_schedule ON public.sb_events;
CREATE TRIGGER sb_event_post_report_schedule
 AFTER INSERT OR UPDATE OF ends_at,status,public_beta_test ON public.sb_events
 FOR EACH ROW EXECUTE FUNCTION public.sb_queue_post_event_report();

-- Existing future, genuinely published or explicit public €0-test events
-- are eligible. Never retroactively email a finished historical event.
INSERT INTO public.sb_event_post_reports(event_id,scheduled_for)
 SELECT id,ends_at+interval '12 hours' FROM public.sb_events
 WHERE ends_at > now() AND internal_free_test=false AND
  (status='published' OR public_beta_test=true)
ON CONFLICT(event_id) DO NOTHING;

-- Transactional, concurrent-safe claims. A crashed worker can retry only
-- after a 30-minute lease; Resend's stable idempotency key prevents duplicates.
CREATE OR REPLACE FUNCTION public.sb_claim_due_event_reports(p_limit integer DEFAULT 8)
RETURNS TABLE(id uuid,event_id uuid,scheduled_for timestamptz,attempts integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 RETURN QUERY
 WITH due AS (
  SELECT r.id FROM public.sb_event_post_reports r
  WHERE r.sent_at IS NULL AND r.attempts<6 AND r.scheduled_for<=now()
    AND (r.status IN ('pending','failed') AND
         (r.claimed_at IS NULL OR r.claimed_at<now()-interval '15 minutes')
       OR r.status='sending' AND r.claimed_at<now()-interval '30 minutes')
  ORDER BY r.scheduled_for ASC
  FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(20,p_limit))
 )
 UPDATE public.sb_event_post_reports r SET
  status='sending',attempts=r.attempts+1,claimed_at=now(),updated_at=now()
 FROM due WHERE r.id=due.id
 RETURNING r.id,r.event_id,r.scheduled_for,r.attempts;
END $$;
REVOKE ALL ON FUNCTION public.sb_claim_due_event_reports(integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sb_claim_due_event_reports(integer)
 TO service_role;

-- Future settlement integrations will only record Stripe payout identifiers
-- verified server-side. No browser/public permissions and no assumed ETA.
CREATE TABLE IF NOT EXISTS public.sb_event_verified_payouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.sb_events(id) ON DELETE CASCADE,
 stripe_payout_id text NOT NULL UNIQUE CHECK (char_length(stripe_payout_id)>8),
 method text NOT NULL CHECK (method IN ('standard','instant')),
 status text NOT NULL CHECK (status IN ('pending','in_transit','paid','failed','canceled')),
 amount_cents bigint NOT NULL CHECK(amount_cents>=0),
 currency text NOT NULL CHECK(currency IN ('eur','gbp')),
 initiated_at timestamptz NOT NULL,
 arrival_estimate_at timestamptz,
 paid_at timestamptz,
 checked_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sb_event_verified_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sb_event_verified_payouts FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.sb_event_verified_payouts TO service_role;
