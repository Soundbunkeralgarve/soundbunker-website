-- TicketBunker isolated, real €0 ticket test. No financial checkout.
-- Every exception is restricted to a flagged, short-lived internal test event.
ALTER TABLE public.sb_events
 ADD COLUMN IF NOT EXISTS internal_free_test boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS test_code_hash text,
 ADD COLUMN IF NOT EXISTS test_expires_at timestamptz;
ALTER TABLE public.sb_events DROP CONSTRAINT IF EXISTS sb_test_event_scope;
ALTER TABLE public.sb_events ADD CONSTRAINT sb_test_event_scope CHECK (
 NOT internal_free_test OR (
  test_code_hash ~ '^[0-9a-f]{64}$' AND test_expires_at IS NOT NULL
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS sb_internal_free_test_code_idx
 ON public.sb_events(test_code_hash) WHERE test_code_hash IS NOT NULL;
ALTER TABLE public.sb_event_tiers DROP CONSTRAINT IF EXISTS sb_event_tiers_price_cents_check;
ALTER TABLE public.sb_event_tiers ADD CONSTRAINT sb_event_tiers_price_cents_check
 CHECK(price_cents BETWEEN 0 AND 10000000);
ALTER TABLE public.sb_event_orders DROP CONSTRAINT IF EXISTS sb_event_orders_total_cents_check;
ALTER TABLE public.sb_event_orders ADD CONSTRAINT sb_event_orders_total_cents_check
 CHECK(total_cents >= 0);
-- A zero-priced tier/order cannot exist in an ordinary event, even from a privileged SQL client.
CREATE OR REPLACE FUNCTION public.sb_free_test_value_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE good boolean;
BEGIN
 IF TG_TABLE_NAME='sb_event_tiers' THEN
  IF NEW.price_cents=0 THEN
   SELECT e.internal_free_test AND e.test_expires_at>now()
   INTO good FROM public.sb_events e WHERE e.id=NEW.event_id;
   IF NOT COALESCE(good,false) OR NEW.quantity_total>20
    THEN RAISE EXCEPTION 'Free price is restricted to an active internal test event of at most 20 tickets'; END IF;
  END IF;
 ELSE
  IF NEW.total_cents=0 THEN
   SELECT e.internal_free_test AND tt.price_cents=0 AND e.id=tt.event_id
   INTO good FROM public.sb_events e JOIN public.sb_event_tiers tt ON tt.event_id=e.id
   WHERE e.id=NEW.event_id AND tt.id=NEW.tier_id;
   IF NOT COALESCE(good,false) THEN
    RAISE EXCEPTION 'Zero-value orders require a free internal test event tier';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sb_free_test_tier_guard ON public.sb_event_tiers;
CREATE TRIGGER sb_free_test_tier_guard BEFORE INSERT OR UPDATE OF price_cents,quantity_total,event_id
 ON public.sb_event_tiers FOR EACH ROW EXECUTE FUNCTION public.sb_free_test_value_guard();
DROP TRIGGER IF EXISTS sb_free_test_order_guard ON public.sb_event_orders;
CREATE TRIGGER sb_free_test_order_guard BEFORE INSERT OR UPDATE OF total_cents,event_id,tier_id
 ON public.sb_event_orders FOR EACH ROW EXECUTE FUNCTION public.sb_free_test_value_guard();
REVOKE ALL ON FUNCTION public.sb_free_test_value_guard() FROM PUBLIC,anon,authenticated;

-- Enforce the normal organiser's verified-Stripe/listing-fee rules unchanged.
-- The explicit short-lived internal-test flag is the only exception.
CREATE OR REPLACE FUNCTION public.sb_event_publish_controls()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
    THEN RAISE EXCEPTION 'Paid listing or verified charity listing exemption required'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sb_event_publish_controls() FROM PUBLIC,anon,authenticated;

-- Existing public event feed must never expose test links or prices.
DROP POLICY IF EXISTS "Published event list" ON public.sb_events;
CREATE POLICY "Published event list" ON public.sb_events FOR SELECT TO anon,authenticated
 USING(status='published' AND NOT internal_free_test AND starts_at>now()-interval '1 day');
DROP POLICY IF EXISTS "Published ticket tiers" ON public.sb_event_tiers;
CREATE POLICY "Published ticket tiers" ON public.sb_event_tiers FOR SELECT TO anon,authenticated
 USING(EXISTS(SELECT 1 FROM public.sb_events e WHERE e.id=event_id
   AND e.status='published' AND NOT e.internal_free_test AND e.starts_at>now()-interval '1 day'));

-- Atomic, real ticket/order issuing with zero charge. Only server-side service_role may invoke.
CREATE OR REPLACE FUNCTION public.sb_issue_internal_free_test(
 p_event uuid,p_name text,p_email text,p_quantity integer)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ev record; tier record; existing bigint; used_count bigint; created uuid;
BEGIN
 IF p_quantity NOT BETWEEN 1 AND 2 OR char_length(trim(p_name)) NOT BETWEEN 2 AND 100
    OR char_length(trim(p_email)) NOT BETWEEN 5 AND 254
 THEN RAISE EXCEPTION 'Invalid attendee or quantity'; END IF;
 SELECT id,status,starts_at,test_expires_at,currency,internal_free_test
  INTO ev FROM public.sb_events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR NOT ev.internal_free_test OR ev.status<>'published'
    OR ev.test_expires_at<=now() OR ev.starts_at<now()-interval '36 hours'
 THEN RAISE EXCEPTION 'Test event has expired or is unavailable'; END IF;
 SELECT id,quantity_total INTO tier FROM public.sb_event_tiers
   WHERE event_id=p_event AND price_cents=0 ORDER BY created_at LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR tier.quantity_total>20 THEN RAISE EXCEPTION 'Free test tier unavailable'; END IF;
 SELECT coalesce(sum(quantity),0) INTO used_count FROM public.sb_event_orders
  WHERE event_id=p_event AND status IN ('paid','needs_attention');
 IF used_count+p_quantity>tier.quantity_total THEN RAISE EXCEPTION 'Test ticket limit reached'; END IF;
 SELECT coalesce(sum(quantity),0) INTO existing FROM public.sb_event_orders
  WHERE event_id=p_event AND lower(customer_email)=lower(trim(p_email)) AND status='paid';
 IF existing+p_quantity>2 THEN RAISE EXCEPTION 'Only two free test tickets per email'; END IF;
 INSERT INTO public.sb_event_orders
   (event_id,tier_id,customer_name,customer_email,quantity,total_cents,status,reserved_until,currency,paid_at)
 VALUES(p_event,tier.id,trim(p_name),lower(trim(p_email)),p_quantity,0,'paid',now(),ev.currency,now())
 RETURNING id INTO created;
 INSERT INTO public.sb_event_tickets(order_id,event_id,tier_id,sequence_number)
 SELECT created,p_event,tier.id,n FROM generate_series(1,p_quantity) AS n;
 RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.sb_issue_internal_free_test(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sb_issue_internal_free_test(uuid,text,text,integer) TO service_role;
