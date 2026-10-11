-- Organiser selections made at Review & Pay. Pricing is an indicative preview;
-- no money is collected and no Stripe payouts are triggered by this table.
CREATE TABLE IF NOT EXISTS public.sb_event_checkout_preferences (
 event_id uuid PRIMARY KEY REFERENCES public.sb_events(id) ON DELETE CASCADE,
 organiser_profile_id uuid NOT NULL REFERENCES public.sb_event_organisers(id),
 premium_placement boolean NOT NULL DEFAULT false,
 payout_choice text NOT NULL DEFAULT 'standard'
   CHECK (payout_choice IN ('standard','priority')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sb_event_checkout_pref_org_idx
 ON public.sb_event_checkout_preferences(organiser_profile_id);
ALTER TABLE public.sb_event_checkout_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sb_event_checkout_preferences FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.sb_event_checkout_preferences TO service_role;
CREATE OR REPLACE FUNCTION public.sb_checkout_preference_owner_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.sb_events e
   WHERE e.id=NEW.event_id
     AND e.organiser_profile_id=NEW.organiser_profile_id
     AND e.status='draft'
 ) THEN RAISE EXCEPTION 'Only the owning organiser can save draft checkout preferences'; END IF;
 NEW.updated_at=now();
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sb_checkout_pref_owner_guard ON public.sb_event_checkout_preferences;
CREATE TRIGGER sb_checkout_pref_owner_guard
 BEFORE INSERT OR UPDATE ON public.sb_event_checkout_preferences
 FOR EACH ROW EXECUTE FUNCTION public.sb_checkout_preference_owner_guard();
REVOKE ALL ON FUNCTION public.sb_checkout_preference_owner_guard() FROM PUBLIC,anon,authenticated;
