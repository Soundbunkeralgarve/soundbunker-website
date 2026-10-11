-- TicketBunker Street Team: event-scoped promoters with their own tracking links.
-- Tracking only at this stage; no cash/reward credit is earned from €0 tests.
CREATE TABLE IF NOT EXISTS public.sb_event_street_team (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.sb_events(id) ON DELETE CASCADE,
 organiser_profile_id uuid NOT NULL REFERENCES public.sb_event_organisers(id),
 promoter_name text NOT NULL CHECK (char_length(trim(promoter_name)) BETWEEN 2 AND 100),
 promoter_email text NOT NULL CHECK (promoter_email=lower(promoter_email) AND char_length(promoter_email) BETWEEN 5 AND 254),
 referral_code text NOT NULL UNIQUE CHECK (referral_code ~ '^[0-9a-f]{16}$'),
 reward_type text NOT NULL CHECK (reward_type IN ('cash_per_sale','free_tickets','vip_table','other_perk')),
 reward_goal integer NOT NULL DEFAULT 1 CHECK (reward_goal BETWEEN 1 AND 100000),
 reward_value_cents integer NOT NULL DEFAULT 0 CHECK (reward_value_cents BETWEEN 0 AND 1000000),
 reward_description text NOT NULL DEFAULT '' CHECK (char_length(reward_description)<=400),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sb_street_team_event_idx ON public.sb_event_street_team(event_id,active);
CREATE INDEX IF NOT EXISTS sb_street_team_organiser_idx ON public.sb_event_street_team(organiser_profile_id,created_at DESC);
ALTER TABLE public.sb_event_street_team ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sb_event_street_team FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.sb_event_street_team TO service_role;

ALTER TABLE public.sb_event_orders
 ADD COLUMN IF NOT EXISTS street_team_id uuid REFERENCES public.sb_event_street_team(id);
CREATE INDEX IF NOT EXISTS sb_event_order_street_team_idx
 ON public.sb_event_orders(street_team_id,status) WHERE street_team_id IS NOT NULL;

-- Wrapper preserves the audited 4-argument issuer and all quota/locking
-- protections. Referral attribution and ticket issuance are ONE transaction.
CREATE OR REPLACE FUNCTION public.sb_issue_public_beta_ticket_ref(
 p_tier uuid,p_name text,p_email text,p_quantity integer,p_ref text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE booked uuid; target_event uuid; promoter uuid;
BEGIN
 booked:=public.sb_issue_public_beta_ticket(p_tier,p_name,p_email,p_quantity);
 IF p_ref ~ '^[0-9a-f]{16}$' THEN
  SELECT t.event_id INTO target_event FROM public.sb_event_tiers t WHERE t.id=p_tier;
  SELECT s.id INTO promoter FROM public.sb_event_street_team s
    WHERE s.referral_code=p_ref AND s.event_id=target_event AND s.active;
  IF promoter IS NOT NULL THEN
   UPDATE public.sb_event_orders SET street_team_id=promoter
    WHERE id=booked AND beta_test_order=true AND event_id=target_event;
  END IF;
 END IF;
 RETURN booked;
END $$;
REVOKE ALL ON FUNCTION public.sb_issue_public_beta_ticket_ref(uuid,text,text,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sb_issue_public_beta_ticket_ref(uuid,text,text,integer,text)
 TO service_role;
