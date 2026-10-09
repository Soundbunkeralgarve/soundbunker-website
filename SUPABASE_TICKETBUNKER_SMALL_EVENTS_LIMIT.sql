-- Limit ticketBunker small-event BETA ticket allocation to 2,000 per event.
-- Lock event row so concurrent tier additions cannot bypass the shared quota.
CREATE OR REPLACE FUNCTION public.sb_small_event_tier_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE other_total bigint;
BEGIN
 PERFORM id FROM public.sb_events WHERE id=NEW.event_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 SELECT COALESCE(SUM(quantity_total),0) INTO other_total
 FROM public.sb_event_tiers WHERE event_id=NEW.event_id AND id<>NEW.id;
 IF NEW.quantity_total<1 OR other_total+NEW.quantity_total>2000 THEN
  RAISE EXCEPTION 'ticketBunker BETA supports no more than 2,000 total tickets per event';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sb_small_event_tier_limit_trg ON public.sb_event_tiers;
CREATE TRIGGER sb_small_event_tier_limit_trg BEFORE INSERT OR UPDATE OF event_id,quantity_total
 ON public.sb_event_tiers FOR EACH ROW EXECUTE FUNCTION public.sb_small_event_tier_limit();
REVOKE ALL ON FUNCTION public.sb_small_event_tier_limit() FROM public,anon,authenticated;
