-- Disjoint offline lanes: each downloaded ticket has exactly one scanner owner.
-- Reservations NEVER expire automatically: an unreachable phone may hold unsynced entries.
CREATE TABLE IF NOT EXISTS public.tb_scanner_claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.sb_events(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 lane integer NOT NULL CHECK (lane BETWEEN 1 AND 16),
 lane_count integer NOT NULL CHECK (lane_count BETWEEN 1 AND 16 AND lane<=lane_count),
 device_hash text NOT NULL CHECK (device_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 released_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS tb_scanner_one_offline_lane
 ON public.tb_scanner_claims(event_id,lane) WHERE released_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tb_scanner_one_device_claim
 ON public.tb_scanner_claims(event_id,device_hash) WHERE released_at IS NULL;
CREATE TABLE IF NOT EXISTS public.tb_scanner_reservations (
 ticket_id uuid PRIMARY KEY REFERENCES public.sb_event_tickets(id),
 claim_id uuid NOT NULL REFERENCES public.tb_scanner_claims(id),
 version integer NOT NULL,
 admitted_at timestamptz
);
CREATE INDEX IF NOT EXISTS tb_scanner_reservation_claim ON public.tb_scanner_reservations(claim_id);
ALTER TABLE public.tb_scanner_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_scanner_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tb_scanner_claims,public.tb_scanner_reservations FROM anon,authenticated;
GRANT ALL ON public.tb_scanner_claims,public.tb_scanner_reservations TO service_role;

-- Row trigger also protects old app versions and concurrent check-in / transfer RPCs.
CREATE OR REPLACE FUNCTION public.tb_guard_offline_ticket() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE claim uuid; assigned_lane integer;
BEGIN
 SELECT r.claim_id,c.lane INTO claim,assigned_lane FROM public.tb_scanner_reservations r
 JOIN public.tb_scanner_claims c ON c.id=r.claim_id
 WHERE r.ticket_id=OLD.id AND c.released_at IS NULL;
 IF claim IS NOT NULL THEN
  IF NEW.transfer_version IS DISTINCT FROM OLD.transfer_version OR
     NEW.holder_email IS DISTINCT FROM OLD.holder_email OR
     NEW.holder_name IS DISTINCT FROM OLD.holder_name THEN
   RAISE EXCEPTION 'Ticket is assigned to an offline scanner; sync and finish offline mode before changing it' USING ERRCODE='55000';
  END IF;
  IF NEW.checked_in_at IS DISTINCT FROM OLD.checked_in_at AND
     current_setting('ticketbunker.offline_claim',true) IS DISTINCT FROM claim::text THEN
   RAISE EXCEPTION 'Ticket is reserved for offline lane %. Use that scanner.',assigned_lane USING ERRCODE='55000';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tb_guard_offline_ticket() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS tb_offline_ticket_guard ON public.sb_event_tickets;
CREATE TRIGGER tb_offline_ticket_guard BEFORE UPDATE ON public.sb_event_tickets
 FOR EACH ROW EXECUTE FUNCTION public.tb_guard_offline_ticket();

CREATE OR REPLACE FUNCTION public.tb_prepare_offline_scanner(p_event uuid,p_actor uuid,p_device text,p_resume uuid DEFAULT NULL,p_lanes integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE ev record; claim public.tb_scanner_claims; payload jsonb; deadline timestamptz; locked_ids uuid[]; configured_lanes integer; next_lane integer;
BEGIN
 IF p_lanes IS NULL OR p_lanes NOT BETWEEN 1 AND 16 THEN RAISE EXCEPTION 'Choose between 1 and 16 offline scanners'; END IF;
 IF p_actor IS NULL OR p_device IS NULL OR p_device !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid scanner identity'; END IF;
 SELECT * INTO ev FROM public.sb_events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='admin')
 AND NOT EXISTS(SELECT 1 FROM public.sb_event_staff_access WHERE event_id=p_event AND user_id=p_actor AND revoked_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public.sb_event_organisers WHERE id=ev.organiser_profile_id AND owner_user_id=p_actor)
 THEN RAISE EXCEPTION 'Staff access denied' USING ERRCODE='42501'; END IF;
 IF ev.status<>'published' OR now()<ev.starts_at-interval '18 hours' OR now()>ev.starts_at+interval '36 hours'
 OR (ev.internal_free_test AND (ev.test_expires_at IS NULL OR ev.test_expires_at<=now()))
 THEN RAISE EXCEPTION 'Event is not open for offline entry'; END IF;
 deadline:=least(now()+interval '12 hours',ev.starts_at+interval '36 hours',
  CASE WHEN ev.internal_free_test THEN ev.test_expires_at ELSE 'infinity'::timestamptz END);
 SELECT lane_count INTO configured_lanes FROM public.tb_scanner_claims WHERE event_id=p_event AND released_at IS NULL LIMIT 1;
 IF FOUND AND configured_lanes<>p_lanes THEN
  RAISE EXCEPTION 'Event is configured for % offline lanes. Use the same scanner count on every phone.',configured_lanes USING ERRCODE='55000';
 END IF;
 SELECT * INTO claim FROM public.tb_scanner_claims WHERE event_id=p_event AND device_hash=p_device AND released_at IS NULL FOR UPDATE;
 IF FOUND AND claim.user_id<>p_actor THEN RAISE EXCEPTION 'This phone has another staff account assigned to offline entry' USING ERRCODE='55000'; END IF;
 IF claim.id IS NOT NULL AND p_resume IS DISTINCT FROM claim.id THEN
  RAISE EXCEPTION 'This event already has an offline download. Return to the original saved download; do not reset scanner data' USING ERRCODE='55000';
 END IF;
 IF claim.id IS NULL THEN
  SELECT n INTO next_lane FROM generate_series(1,p_lanes) n WHERE NOT EXISTS
   (SELECT 1 FROM public.tb_scanner_claims c WHERE c.event_id=p_event AND c.lane=n AND c.released_at IS NULL) ORDER BY n LIMIT 1;
  IF next_lane IS NULL THEN RAISE EXCEPTION 'All offline lanes already have a phone. Sync and finish on a phone before replacing it' USING ERRCODE='55000'; END IF;
  INSERT INTO public.tb_scanner_claims(event_id,user_id,device_hash,expires_at,lane,lane_count)
  VALUES(p_event,p_actor,p_device,deadline,next_lane,p_lanes) RETURNING * INTO claim;
 ELSE
  UPDATE public.tb_scanner_claims SET expires_at=deadline WHERE id=claim.id RETURNING * INTO claim;
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
 RETURN jsonb_build_object('claimId',claim.id,'eventId',p_event,'event',ev.title,'venue',ev.venue,
  'lane',claim.lane,'laneCount',claim.lane_count,'createdAt',claim.created_at,'expiresAt',claim.expires_at,'serverTime',now(),
  'test',coalesce(ev.internal_free_test,false) OR coalesce(ev.public_beta_test,false),'tickets',payload);
END $$;

CREATE OR REPLACE FUNCTION public.tb_sync_offline_scanner(p_claim uuid,p_actor uuid,p_device text,p_entries jsonb,p_release boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE claim public.tb_scanner_claims; entry jsonb; reservation public.tb_scanner_reservations;
 ticket public.sb_event_tickets; accepted jsonb:='[]'::jsonb; scanned timestamptz;
BEGIN
 IF jsonb_typeof(p_entries)<>'array' OR jsonb_array_length(p_entries)>200 THEN RAISE EXCEPTION 'Invalid scan batch'; END IF;
 SELECT * INTO claim FROM public.tb_scanner_claims WHERE id=p_claim FOR UPDATE;
 IF NOT FOUND OR claim.user_id IS DISTINCT FROM p_actor OR claim.device_hash IS DISTINCT FROM p_device
 THEN RAISE EXCEPTION 'Offline scanner identity mismatch' USING ERRCODE='42501'; END IF;
 -- Allow upload after staff revocation / event close: previously admitted entries must not be lost.
 -- This grants no fresh ticket download or new offline permit.
 FOR entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
  SELECT * INTO ticket FROM public.sb_event_tickets WHERE id=(entry->>'id')::uuid FOR UPDATE;
  SELECT * INTO reservation FROM public.tb_scanner_reservations WHERE ticket_id=ticket.id AND claim_id=claim.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not reserved by this phone'; END IF;
  scanned:=(entry->>'at')::timestamptz;
  IF scanned IS NULL OR scanned<claim.created_at OR scanned>claim.expires_at OR scanned>now()+interval '2 minutes'
  THEN RAISE EXCEPTION 'Scan is outside the offline permit'; END IF;
  IF reservation.admitted_at IS NULL THEN
   IF claim.released_at IS NOT NULL OR ticket.checked_in_at IS NOT NULL OR ticket.transfer_version<>reservation.version
   THEN RAISE EXCEPTION 'Offline ticket state conflict'; END IF;
   PERFORM set_config('ticketbunker.offline_claim',claim.id::text,true);
   UPDATE public.sb_event_tickets SET checked_in_at=scanned,checked_in_by=p_actor WHERE id=ticket.id;
   UPDATE public.tb_scanner_reservations SET admitted_at=scanned WHERE ticket_id=ticket.id;
  END IF;
  accepted:=accepted||jsonb_build_array(ticket.id);
 END LOOP;
 IF p_release AND claim.released_at IS NULL THEN
  UPDATE public.tb_scanner_claims SET released_at=now() WHERE id=claim.id;
  -- Keep used reservations as durable idempotency receipts; unused ones become transferable.
  DELETE FROM public.tb_scanner_reservations WHERE claim_id=claim.id AND admitted_at IS NULL;
 END IF;
 RETURN jsonb_build_object('accepted',accepted,'released',p_release OR claim.released_at IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.tb_prepare_offline_scanner(uuid,uuid,text,uuid,integer),public.tb_sync_offline_scanner(uuid,uuid,text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tb_prepare_offline_scanner(uuid,uuid,text,uuid,integer),public.tb_sync_offline_scanner(uuid,uuid,text,jsonb,boolean) TO service_role;
