-- Preserve private review access until its explicit expiry, with existing
-- staff authorization, ticket signatures and reservations unchanged.
CREATE OR REPLACE FUNCTION public.tb_prepare_offline_scanner(p_event uuid, p_actor uuid, p_device text, p_resume uuid DEFAULT NULL::uuid, p_lanes integer DEFAULT 1, p_hub boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE ev record; claim public.tb_scanner_claims; payload jsonb; deadline timestamptz; locked_ids uuid[]; configured_lanes integer; next_lane integer; staff_ids uuid[]; staff_payload jsonb;
BEGIN
 IF p_lanes IS NULL OR p_lanes NOT BETWEEN 1 AND 16 THEN RAISE EXCEPTION 'Choose between 1 and 16 offline scanners'; END IF;
 IF p_actor IS NULL OR p_device IS NULL OR p_device !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid scanner identity'; END IF;
 SELECT * INTO ev FROM public.sb_events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='admin')
 AND NOT EXISTS(SELECT 1 FROM public.sb_event_staff_access WHERE event_id=p_event AND user_id=p_actor AND revoked_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public.sb_event_organisers WHERE id=ev.organiser_profile_id AND owner_user_id=p_actor)
 THEN RAISE EXCEPTION 'Staff access denied' USING ERRCODE='42501'; END IF;
 IF p_hub AND (p_lanes<>1 OR (NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='admin')
 AND NOT EXISTS(SELECT 1 FROM public.sb_event_organisers WHERE id=ev.organiser_profile_id AND owner_user_id=p_actor)))
 THEN RAISE EXCEPTION 'Only the organiser or admin can prepare a shared check-in hub' USING ERRCODE='42501'; END IF;
 SELECT array_agg(DISTINCT member) INTO staff_ids FROM (
  SELECT p_actor member UNION SELECT user_id FROM public.sb_event_staff_access WHERE event_id=p_event AND revoked_at IS NULL
 ) members;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.full_name,''),p.email,p.id::text))),'[]'::jsonb)
 INTO staff_payload FROM public.profiles p WHERE p.id=ANY(staff_ids);
 IF ev.status<>'published'
 OR (ev.internal_free_test AND (ev.public_beta_test OR ev.test_expires_at IS NULL OR ev.test_expires_at<=now()))
 OR (NOT coalesce(ev.internal_free_test,false) AND (now()<ev.starts_at-interval '18 hours' OR now()>ev.starts_at+interval '36 hours'))
 THEN RAISE EXCEPTION 'Event is not open for offline entry'; END IF;
 deadline:=CASE WHEN ev.internal_free_test THEN
  least(now()+CASE WHEN p_hub THEN interval '36 hours' ELSE interval '12 hours' END,ev.test_expires_at)
 ELSE least(CASE WHEN p_hub THEN ev.starts_at+interval '36 hours' ELSE now()+interval '12 hours' END,ev.starts_at+interval '36 hours') END;
 SELECT lane_count INTO configured_lanes FROM public.tb_scanner_claims WHERE event_id=p_event AND released_at IS NULL LIMIT 1;
 IF FOUND AND configured_lanes<>p_lanes THEN
  RAISE EXCEPTION 'Event is configured for % offline lanes. Use the same scanner count on every phone.',configured_lanes USING ERRCODE='55000';
 END IF;
 SELECT * INTO claim FROM public.tb_scanner_claims WHERE event_id=p_event AND device_hash=p_device AND released_at IS NULL FOR UPDATE;
 IF FOUND AND claim.user_id<>p_actor THEN RAISE EXCEPTION 'This phone has another staff account assigned to offline entry' USING ERRCODE='55000'; END IF;
 IF claim.id IS NOT NULL AND claim.mode<>(CASE WHEN p_hub THEN 'hub' ELSE 'lane' END) THEN RAISE EXCEPTION 'Finish the current scanner mode before switching to a hub or lane' USING ERRCODE='55000'; END IF;
 IF claim.id IS NOT NULL AND p_resume IS DISTINCT FROM claim.id THEN
  RAISE EXCEPTION 'This event already has an offline download. Return to the original saved download; do not reset scanner data' USING ERRCODE='55000';
 END IF;
 IF claim.id IS NULL THEN
  SELECT n INTO next_lane FROM generate_series(1,p_lanes) n WHERE NOT EXISTS
   (SELECT 1 FROM public.tb_scanner_claims c WHERE c.event_id=p_event AND c.lane=n AND c.released_at IS NULL) ORDER BY n LIMIT 1;
  IF next_lane IS NULL THEN RAISE EXCEPTION 'All offline lanes already have a phone. Sync and finish on a phone before replacing it' USING ERRCODE='55000'; END IF;
  INSERT INTO public.tb_scanner_claims(id,event_id,user_id,device_hash,expires_at,lane,lane_count,mode,allowed_staff)
  VALUES(coalesce(p_resume,gen_random_uuid()),p_event,p_actor,p_device,deadline,next_lane,p_lanes,CASE WHEN p_hub THEN 'hub' ELSE 'lane' END,staff_ids) RETURNING * INTO claim;
 ELSE
  UPDATE public.tb_scanner_claims SET expires_at=deadline,allowed_staff=ARRAY(SELECT DISTINCT unnest(claim.allowed_staff||staff_ids)) WHERE id=claim.id RETURNING * INTO claim;
 END IF;
 -- Serialise against existing live scans and transfers. Already used tickets are excluded.
 SELECT array_agg(locked.id) INTO locked_ids FROM (SELECT t.id FROM public.sb_event_tickets t WHERE t.event_id=p_event ORDER BY t.id FOR UPDATE) locked;
 DELETE FROM public.tb_scanner_reservations r USING public.sb_event_tickets t,public.sb_event_orders o
 WHERE r.claim_id=claim.id AND r.admitted_at IS NULL AND t.id=r.ticket_id AND o.id=t.order_id AND o.status<>'paid';
 INSERT INTO public.tb_scanner_reservations(ticket_id,claim_id,version)
 SELECT t.id,claim.id,t.transfer_version FROM public.sb_event_tickets t
 JOIN public.sb_event_orders o ON o.id=t.order_id
 WHERE t.id=ANY(locked_ids) AND (('x'||substr(t.id::text,1,8))::bit(32)::bigint % p_lanes)+1=claim.lane AND t.checked_in_at IS NULL AND o.status='paid' AND NOT coalesce(o.beta_test_order,false)
 ON CONFLICT(ticket_id) DO NOTHING;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'version',r.version,'used',r.admitted_at IS NOT NULL,
  'tier',tt.name) ORDER BY t.id),'[]'::jsonb) INTO payload
 FROM public.tb_scanner_reservations r JOIN public.sb_event_tickets t ON t.id=r.ticket_id
 JOIN public.sb_event_tiers tt ON tt.id=t.tier_id WHERE r.claim_id=claim.id;
 PERFORM public.tb_refresh_offline_report(p_event);
 RETURN jsonb_build_object('claimId',claim.id,'eventId',p_event,'event',ev.title,'venue',ev.venue,
  'mode',claim.mode,'staff',CASE WHEN p_hub THEN staff_payload ELSE '[]'::jsonb END,'lane',claim.lane,'laneCount',claim.lane_count,'createdAt',claim.created_at,'expiresAt',claim.expires_at,'serverTime',now(),
  'test',coalesce(ev.internal_free_test,false) OR coalesce(ev.public_beta_test,false),'tickets',payload);
END $function$;
