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

-- Preserve existing beta procedure contract; add a fifth *optional* referral argument.
CREATE OR REPLACE FUNCTION public.sb_issue_public_beta_ticket(
 p_tier uuid,p_name text,p_email text,p_quantity integer,p_ref text DEFAULT null
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ev record; tier record; used_count bigint; existing bigint; created uuid; promoter uuid;
BEGIN
 IF p_quantity NOT BETWEEN 1 AND 4 OR char_length(trim(p_name)) NOT BETWEEN 2 AND 100
    OR char_length(trim(p_email)) NOT BETWEEN 5 AND 254
 THEN RAISE EXCEPTION 'Invalid test booking details'; END IF;
 SELECT e.id,e.status,e.currency,e.public_beta_test,e.beta_test_expires_at,e.starts_at
  INTO ev FROM public.sb_event_tiers t JOIN public.sb_events e ON e.id=t.event_id
  WHERE t.id=p_tier FOR UPDATE OF e;
 IF NOT FOUND OR NOT ev.public_beta_test OR ev.status<>'draft' OR ev.beta_test_expires_at<=now()
 THEN RAISE EXCEPTION 'This test booking is closed'; END IF;
 SELECT id,quantity_total,price_cents INTO tier
 FROM public.sb_event_tiers WHERE id=p_tier AND event_id=ev.id FOR UPDATE;
 IF NOT FOUND OR tier.price_cents<100 THEN RAISE EXCEPTION 'Ticket type unavailable'; END IF;
 SELECT coalesce(sum(quantity),0) INTO used_count FROM public.sb_event_orders
 WHERE tier_id=tier.id AND status IN ('paid','needs_attention')
 AND (NOT beta_test_order OR (SELECT e.public_beta_test AND e.beta_test_expires_at>now()
   FROM public.sb_events e WHERE e.id=event_id));
 IF used_count+p_quantity>least(tier.quantity_total,50)
 THEN RAISE EXCEPTION 'Test ticket allocation is full'; END IF;
 SELECT coalesce(sum(quantity),0) INTO existing FROM public.sb_event_orders
 WHERE event_id=ev.id AND lower(customer_email)=lower(trim(p_email))
 AND status='paid' AND beta_test_order;
 IF existing+p_quantity>4 THEN RAISE EXCEPTION 'Maximum four test tickets per email per event'; END IF;
 IF p_ref IS NOT NULL AND p_ref <> '' THEN
  SELECT st.id INTO promoter FROM public.sb_event_street_team st
  WHERE st.referral_code=p_ref AND st.active AND st.event_id=ev.id;
 END IF;
 INSERT INTO public.sb_event_orders
 (event_id,tier_id,customer_name,customer_email,quantity,total_cents,status,reserved_until,currency,paid_at,beta_test_order,street_team_id)
 VALUES(ev.id,tier.id,trim(p_name),lower(trim(p_email)),p_quantity,0,'paid',now(),ev.currency,now(),true,promoter)
 RETURNING id INTO created;
 INSERT INTO public.sb_event_tickets(order_id,event_id,tier_id,sequence_number)
 SELECT created,ev.id,tier.id,n FROM generate_series(1,p_quantity) n;
 RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.sb_issue_public_beta_ticket(uuid,text,text,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sb_issue_public_beta_ticket(uuid,text,text,integer,text)
 TO service_role;
-- Remove legacy four-argument function to prevent side-path that bypasses tracking
-- and keep all callers compatible via the optional fifth parameter.
DROP FUNCTION IF EXISTS public.sb_issue_public_beta_ticket(uuid,text,text,integer);
