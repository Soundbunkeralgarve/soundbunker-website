-- TicketBunker named tickets and verified-account ownership transfers.
-- Additive and private. Existing buyer tickets remain owned by the paid order email.
ALTER TABLE public.sb_event_tickets
 ADD COLUMN IF NOT EXISTS holder_email text,
 ADD COLUMN IF NOT EXISTS holder_name text,
 ADD COLUMN IF NOT EXISTS transfer_version integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS transferred_at timestamptz;
ALTER TABLE public.sb_event_tickets DROP CONSTRAINT IF EXISTS sb_ticket_transfer_version_bound;
ALTER TABLE public.sb_event_tickets ADD CONSTRAINT sb_ticket_transfer_version_bound
 CHECK (transfer_version BETWEEN 0 AND 5);
ALTER TABLE public.sb_event_tickets DROP CONSTRAINT IF EXISTS sb_ticket_holder_email_check;
ALTER TABLE public.sb_event_tickets ADD CONSTRAINT sb_ticket_holder_email_check
 CHECK (holder_email IS NULL OR (length(holder_email) BETWEEN 5 AND 254 AND holder_email=lower(trim(holder_email))));
CREATE INDEX IF NOT EXISTS sb_event_ticket_holder_email_idx
 ON public.sb_event_tickets(holder_email) WHERE holder_email IS NOT NULL;

-- A transfer must be atomic and prevent the previous QR from being accepted.
-- Only the service_role may call this function, after the API verifies Supabase
-- auth and the user's confirmed email. Row lock serialises transfer vs scan.
CREATE OR REPLACE FUNCTION public.sb_manage_named_event_ticket(
 p_ticket uuid,p_sender_email text,p_recipient_email text,p_name text,p_action text
) RETURNS TABLE(ticket_id uuid,holder_email text,holder_name text,transfer_version integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r record; clean_sender text; clean_email text; clean_name text;
BEGIN
 clean_sender:=lower(trim(p_sender_email));
 clean_email:=lower(trim(p_recipient_email));
 clean_name:=trim(p_name);
 IF p_action NOT IN ('name','transfer') OR
    char_length(clean_sender) NOT BETWEEN 5 AND 254 OR
    char_length(clean_name) NOT BETWEEN 2 AND 100 OR
    clean_name ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'Invalid ticket update' USING ERRCODE='22023'; END IF;
 SELECT t.id,t.checked_in_at,t.transfer_version,
        coalesce(t.holder_email,o.customer_email) AS current_email,
        o.status,e.starts_at
 INTO r FROM public.sb_event_tickets t
 JOIN public.sb_event_orders o ON o.id=t.order_id
 JOIN public.sb_events e ON e.id=t.event_id
 WHERE t.id=p_ticket FOR UPDATE OF t;
 IF NOT FOUND OR r.status<>'paid' OR lower(r.current_email)<>clean_sender
 THEN RAISE EXCEPTION 'Ticket not held by this account' USING ERRCODE='42501'; END IF;
 IF r.checked_in_at IS NOT NULL OR r.starts_at<=now()
 THEN RAISE EXCEPTION 'Ticket can no longer be changed' USING ERRCODE='22023'; END IF;
 IF p_action='transfer' THEN
  IF clean_email=clean_sender OR char_length(clean_email) NOT BETWEEN 5 AND 254 OR
    clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  THEN RAISE EXCEPTION 'A different valid recipient email is required' USING ERRCODE='22023'; END IF;
  IF r.transfer_version>=5 THEN
   RAISE EXCEPTION 'Ticket transfer limit reached' USING ERRCODE='22023'; END IF;
  UPDATE public.sb_event_tickets t SET
   holder_email=clean_email,holder_name=clean_name,
   transfer_version=t.transfer_version+1,transferred_at=now()
  WHERE t.id=p_ticket;
 ELSE
  UPDATE public.sb_event_tickets t SET holder_name=clean_name WHERE t.id=p_ticket;
 END IF;
 RETURN QUERY SELECT t.id,t.holder_email,t.holder_name,t.transfer_version
 FROM public.sb_event_tickets t WHERE t.id=p_ticket;
END $$;
REVOKE ALL ON FUNCTION public.sb_manage_named_event_ticket(uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sb_manage_named_event_ticket(uuid,text,text,text,text)
 TO service_role;

-- Validate the QR generation number *inside the row lock* before check-in,
-- preventing a transferred-away ticket being scanned during a race.
CREATE OR REPLACE FUNCTION public.sb_checkin_event_ticket_versioned(
 p_ticket uuid,p_actor uuid,p_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE current_version integer;
BEGIN
 SELECT t.transfer_version INTO current_version
 FROM public.sb_event_tickets t WHERE t.id=p_ticket FOR UPDATE;
 IF NOT FOUND OR current_version<>p_version
 THEN RETURN jsonb_build_object('status','invalid','message','This ticket was transferred and the old QR has expired'); END IF;
 RETURN public.sb_checkin_event_ticket(p_ticket,p_actor);
END $$;
REVOKE ALL ON FUNCTION public.sb_checkin_event_ticket_versioned(uuid,uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sb_checkin_event_ticket_versioned(uuid,uuid,integer) TO service_role;

