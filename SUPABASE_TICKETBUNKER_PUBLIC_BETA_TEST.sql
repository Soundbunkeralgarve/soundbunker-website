-- TicketBunker public beta bookings: real organiser events, temporarily €0, no Stripe.
-- Paid tier prices remain unchanged. This is NOT normal paid publication.
ALTER TABLE public.sb_events
 ADD COLUMN IF NOT EXISTS public_beta_test boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS beta_test_expires_at timestamptz;
ALTER TABLE public.sb_events DROP CONSTRAINT IF EXISTS sb_public_beta_event_scope;
ALTER TABLE public.sb_events ADD CONSTRAINT sb_public_beta_event_scope
 CHECK (NOT public_beta_test OR (
   NOT internal_free_test AND status='draft' AND
   beta_test_expires_at IS NOT NULL));
ALTER TABLE public.sb_event_orders
 ADD COLUMN IF NOT EXISTS beta_test_order boolean NOT NULL DEFAULT false;
ALTER TABLE public.sb_event_orders DROP CONSTRAINT IF EXISTS sb_order_beta_zero_value;
ALTER TABLE public.sb_event_orders ADD CONSTRAINT sb_order_beta_zero_value
 CHECK (NOT beta_test_order OR total_cents=0);
CREATE INDEX IF NOT EXISTS sb_beta_test_order_idx
 ON public.sb_event_orders(event_id) WHERE beta_test_order;

CREATE INDEX IF NOT EXISTS sb_active_public_beta_idx
 ON public.sb_events(beta_test_expires_at) WHERE public_beta_test;

-- Allow zero-value orders ONLY for explicitly flagged, unexpired public beta test
-- or pre-existing isolated internal test. Never make ordinary tiers zero-priced.
CREATE OR REPLACE FUNCTION public.sb_free_test_value_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE good boolean;
BEGIN
 IF TG_TABLE_NAME='sb_event_tiers' THEN
  IF NEW.price_cents=0 THEN
   SELECT e.internal_free_test AND e.test_expires_at>now()
    INTO good FROM public.sb_events e WHERE e.id=NEW.event_id;
   IF NOT coalesce(good,false) OR NEW.quantity_total>20
   THEN RAISE EXCEPTION 'Free price is restricted to an active internal test event of at most 20 tickets'; END IF;
  END IF;
 ELSE
  IF NEW.total_cents=0 THEN
   SELECT (e.internal_free_test AND tt.price_cents=0 AND e.id=tt.event_id)
    OR (e.public_beta_test AND e.status='draft' AND
        e.beta_test_expires_at>now() AND tt.price_cents>=100 AND
        e.id=tt.event_id)
   INTO good FROM public.sb_events e JOIN public.sb_event_tiers tt ON tt.event_id=e.id
    WHERE e.id=NEW.event_id AND tt.id=NEW.tier_id;
   IF NOT coalesce(good,false)
   THEN RAISE EXCEPTION 'Zero-value orders require a valid test-only event'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sb_free_test_value_guard() FROM PUBLIC,anon,authenticated;

-- Atomic and inventory-safe test issuance, scoped to the requested tier.
-- Only service_role can call. No payment and no real event-admission rights.
CREATE OR REPLACE FUNCTION public.sb_issue_public_beta_ticket(
 p_tier uuid,p_name text,p_email text,p_quantity integer
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ev record; tier record; used_count bigint; existing bigint; created uuid;
BEGIN
 IF p_quantity NOT BETWEEN 1 AND 4 OR char_length(trim(p_name)) NOT BETWEEN 2 AND 100
    OR char_length(trim(p_email)) NOT BETWEEN 5 AND 254
 THEN RAISE EXCEPTION 'Invalid test booking details'; END IF;
 SELECT e.id,e.status,e.currency,e.public_beta_test,e.beta_test_expires_at,e.starts_at
  INTO ev FROM public.sb_event_tiers t JOIN public.sb_events e ON e.id=t.event_id
  WHERE t.id=p_tier FOR UPDATE OF e;
 IF NOT FOUND OR NOT ev.public_beta_test OR ev.status<>'draft' OR
    ev.beta_test_expires_at<=now() OR ev.starts_at<=now()
 THEN RAISE EXCEPTION 'This test booking is closed'; END IF;
 SELECT id,quantity_total,price_cents INTO tier
  FROM public.sb_event_tiers WHERE id=p_tier AND event_id=ev.id FOR UPDATE;
 IF NOT FOUND OR tier.price_cents<100 THEN RAISE EXCEPTION 'Ticket type unavailable'; END IF;
 SELECT coalesce(sum(quantity),0) INTO used_count FROM public.sb_event_orders
  WHERE tier_id=tier.id AND status IN ('paid','needs_attention');
 IF used_count+p_quantity>least(tier.quantity_total,50)
 THEN RAISE EXCEPTION 'Test ticket allocation is full'; END IF;
 SELECT coalesce(sum(quantity),0) INTO existing FROM public.sb_event_orders
  WHERE event_id=ev.id AND lower(customer_email)=lower(trim(p_email)) AND status='paid'
  AND total_cents=0;
 IF existing+p_quantity>4 THEN RAISE EXCEPTION 'Maximum four test tickets per email per event'; END IF;
 INSERT INTO public.sb_event_orders
  (event_id,tier_id,customer_name,customer_email,quantity,total_cents,status,reserved_until,currency,paid_at,beta_test_order)
 VALUES(ev.id,tier.id,trim(p_name),lower(trim(p_email)),p_quantity,0,'paid',now(),ev.currency,now(),true)
 RETURNING id INTO created;
 INSERT INTO public.sb_event_tickets(order_id,event_id,tier_id,sequence_number)
 SELECT created,ev.id,tier.id,n FROM generate_series(1,p_quantity) n;
 RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.sb_issue_public_beta_ticket(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sb_issue_public_beta_ticket(uuid,text,text,integer) TO service_role;

-- Scanner accepts test tickets at any time while beta listing is active.
-- Standard paid tickets retain the original 18-hour-before/36-hour-after rule.
CREATE OR REPLACE FUNCTION public.sb_checkin_event_ticket(p_ticket uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t record;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Scanner identity required'; END IF;
 SELECT tk.id,tk.event_id,tk.checked_in_at,e.title,e.starts_at,e.status,
        e.public_beta_test,e.beta_test_expires_at,o.beta_test_order,tt.name tier_name
 INTO t FROM public.sb_event_tickets tk
 JOIN public.sb_events e ON e.id=tk.event_id
 JOIN public.sb_event_tiers tt ON tt.id=tk.tier_id
 JOIN public.sb_event_orders o ON o.id=tk.order_id
 WHERE tk.id=p_ticket FOR UPDATE OF tk;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_actor AND p.role='admin')
    AND NOT EXISTS(SELECT 1 FROM public.sb_event_staff_access s
     WHERE s.event_id=t.event_id AND s.user_id=p_actor AND s.revoked_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM public.sb_events e JOIN public.sb_event_organisers org
     ON org.id=e.organiser_profile_id WHERE e.id=t.event_id AND org.owner_user_id=p_actor)
 THEN RAISE EXCEPTION 'Staff access denied for this event'; END IF;
 IF t.checked_in_at IS NOT NULL
 THEN RETURN jsonb_build_object('status','used','checked_in_at',t.checked_in_at,'event',t.title); END IF;
 IF t.beta_test_order AND NOT (t.public_beta_test AND t.status='draft'
   AND t.beta_test_expires_at>now())
 THEN RETURN jsonb_build_object('status','not_open','event',t.title,'message','Software test is no longer active'); END IF;
 IF NOT ((t.status='published' AND now()>=t.starts_at-interval '18 hours'
       AND now()<=t.starts_at+interval '36 hours')
       OR (t.public_beta_test AND t.status='draft' AND t.beta_test_expires_at>now()))
 THEN RETURN jsonb_build_object('status','not_open','event',t.title); END IF;
 UPDATE public.sb_event_tickets SET checked_in_at=now(),checked_in_by=p_actor
 WHERE id=p_ticket AND checked_in_at IS NULL;
 RETURN jsonb_build_object('status','valid','event',t.title,'tier',t.tier_name,
  'beta_test',coalesce(t.public_beta_test,false));
END $$;
REVOKE ALL ON FUNCTION public.sb_checkin_event_ticket(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sb_checkin_event_ticket(uuid,uuid) TO service_role;

-- Test bookings do not reduce paid-sale inventory when test mode is switched off.
-- During an active test session, the zero-value orders count toward test limits.
CREATE OR REPLACE FUNCTION public.sb_event_inventory()
RETURNS TABLE(tier_id uuid,used_count bigint)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT o.tier_id,coalesce(sum(o.quantity),0)::bigint
 FROM public.sb_event_orders o JOIN public.sb_events e ON e.id=o.event_id
 WHERE (o.status IN ('paid','needs_attention') OR
        (o.status='reserved' AND o.reserved_until>now()))
   AND (NOT o.beta_test_order OR
        (e.public_beta_test AND e.beta_test_expires_at>now()))
 GROUP BY o.tier_id
$$;
REVOKE ALL ON FUNCTION public.sb_event_inventory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sb_event_inventory() TO service_role;
