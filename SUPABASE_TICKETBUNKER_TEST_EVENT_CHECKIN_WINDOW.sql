-- Private €0 test events (internal_free_test) stay scannable until their own test_expires_at.
-- Before this, check-in only opened 18h before to 36h after starts_at, so a long-lived
-- test event (e.g. the App Store review demo) refused every scan two days after it started.
-- Real events keep exactly the same window.
CREATE OR REPLACE FUNCTION public.sb_checkin_event_ticket(p_ticket uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE t record;
BEGIN
 IF p_actor IS NULL THEN RAISE EXCEPTION 'Scanner identity required'; END IF;
 SELECT tk.id,tk.event_id,tk.checked_in_at,e.title,e.starts_at,e.status,
        e.public_beta_test,e.beta_test_expires_at,e.internal_free_test,e.test_expires_at,
        o.status order_status,o.guest_allocation_id,o.beta_test_order,tt.name tier_name
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
 IF t.order_status<>'paid' THEN RETURN jsonb_build_object('status','invalid','message','Ticket cancelled or refunded'); END IF;
 IF t.checked_in_at IS NOT NULL
 THEN RETURN jsonb_build_object('status','used','checked_in_at',t.checked_in_at,'event',t.title); END IF;
 IF t.beta_test_order AND NOT (t.public_beta_test AND t.status='draft'
   AND t.beta_test_expires_at>now())
 THEN RETURN jsonb_build_object('status','not_open','event',t.title,'message','Software test is no longer active'); END IF;
 IF NOT ((t.status='published' AND now()>=t.starts_at-interval '18 hours'
       AND now()<=t.starts_at+interval '36 hours')
       OR (t.public_beta_test AND t.status='draft' AND t.beta_test_expires_at>now())
       OR (t.internal_free_test AND t.status='published' AND t.test_expires_at>now()))
 THEN RETURN jsonb_build_object('status','not_open','event',t.title,'message','Check-in is not open for this event'); END IF;
 UPDATE public.sb_event_tickets SET checked_in_at=now(),checked_in_by=p_actor
 WHERE id=p_ticket AND checked_in_at IS NULL;
 RETURN jsonb_build_object('status','valid','event',t.title,'tier',case when t.guest_allocation_id is not null then 'Guest list · '||t.tier_name else t.tier_name end,
  'beta_test',coalesce(t.public_beta_test,false));
END $function$;
