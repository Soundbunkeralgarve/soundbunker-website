DO $$
DECLARE actor uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid();
 e_id uuid; tier_id uuid; order_id uuid; ticket_id uuid; result jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor),(stranger);
 INSERT INTO public.profiles(id,role) VALUES(actor,'client'),(stranger,'client');
 INSERT INTO public.sb_events(slug,title,starts_at,status)
 VALUES('gate-security-test','Gate security test',now()+interval '15 minutes','published') RETURNING id INTO e_id;
 INSERT INTO public.sb_event_tiers(event_id,name,price_cents,quantity_total)
 VALUES(e_id,'Day pass',2000,50) RETURNING id INTO tier_id;
 INSERT INTO public.sb_event_orders(event_id,tier_id,customer_name,customer_email,quantity,total_cents,reserved_until,status)
 VALUES(e_id,tier_id,'Sample','sample@example.com',1,2000,now()+interval '30 minutes','paid')
 RETURNING id INTO order_id;
 INSERT INTO public.sb_event_tickets(order_id,event_id,tier_id,sequence_number)
 VALUES(order_id,e_id,tier_id,1) RETURNING id INTO ticket_id;
 BEGIN
  PERFORM public.sb_checkin_event_ticket(ticket_id,stranger);
  RAISE EXCEPTION 'Unauthorised scanner accepted';
 EXCEPTION WHEN OTHERS THEN
  IF sqlerrm='Unauthorised scanner accepted' THEN RAISE; END IF;
 END;
 INSERT INTO public.sb_event_staff_access(event_id,user_id,role,granted_by)
 VALUES(e_id,actor,'scanner',actor);
 SELECT public.sb_checkin_event_ticket(ticket_id,actor) INTO result;
 IF result->>'status'<>'valid' THEN RAISE EXCEPTION 'Expected valid first checkin: %',result; END IF;
 SELECT public.sb_checkin_event_ticket(ticket_id,actor) INTO result;
 IF result->>'status'<>'used' THEN RAISE EXCEPTION 'Expected duplicate rejection'; END IF;
 UPDATE public.sb_event_staff_access SET revoked_at=now() WHERE event_id=e_id AND user_id=actor;
 BEGIN
  PERFORM public.sb_checkin_event_ticket(ticket_id,actor);
  RAISE EXCEPTION 'Revoked operator accepted';
 EXCEPTION WHEN OTHERS THEN
  IF sqlerrm='Revoked operator accepted' THEN RAISE; END IF;
 END;
END $$;
