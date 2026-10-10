-- Test optional poster/description and publication review support, without publishing paid tickets.
BEGIN;
DO $$
DECLARE e uuid;
BEGIN
 INSERT INTO public.sb_events(slug,title,description,starts_at,event_kind,status)
 VALUES('wizard-test-'||substr(gen_random_uuid()::text,1,8),'Comedy Test Event',
 'A proper description for a professional event listing under review.',
 now()+interval '2 days','comedy','draft') RETURNING id INTO e;
 UPDATE public.sb_events SET publish_requested_at=now() WHERE id=e;
 IF NOT EXISTS(SELECT 1 FROM public.sb_events
   WHERE id=e AND status='draft' AND publish_requested_at IS NOT NULL AND event_kind='comedy')
 THEN RAISE EXCEPTION 'Publication review changed event status or discarded event category'; END IF;
 BEGIN
   UPDATE public.sb_events SET event_kind='unsupported-kind' WHERE id=e;
   RAISE EXCEPTION 'Invalid event category accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;