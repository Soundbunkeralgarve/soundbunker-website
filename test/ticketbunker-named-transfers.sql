-- Named tickets: account transfer must revoke old QR, preserve owner rules,
-- prevent post-check-in transfers, and remain service_role-only.
BEGIN;
DO $$
DECLARE ev uuid; t uuid; ord uuid; ticket uuid; actor uuid; old_scan jsonb; new_scan jsonb; changed record;
BEGIN
 actor:=gen_random_uuid();
 INSERT INTO auth.users(id) VALUES(actor);
 INSERT INTO public.profiles(id,role) VALUES(actor,'admin');
 INSERT INTO public.sb_events(slug,title,starts_at,status,internal_free_test,test_code_hash,test_expires_at)
 VALUES('named-ticket-test-'||substr(gen_random_uuid()::text,1,8),
  'Named Ticket QA',now()+interval '1 hour','draft',true,repeat('c',64),now()+interval '48 hours')
 RETURNING id INTO ev;
 INSERT INTO public.sb_event_tiers(event_id,name,price_cents,quantity_total)
 VALUES(ev,'Private QR test',0,20) RETURNING id INTO t;
 UPDATE public.sb_events SET status='published' WHERE id=ev;
 SELECT public.sb_issue_internal_free_test(ev,'Original Buyer','buyer@example.test',1) INTO ord;
 SELECT id INTO ticket FROM public.sb_event_tickets WHERE order_id=ord;
 SELECT * INTO changed FROM public.sb_manage_named_event_ticket(
   ticket,'buyer@example.test','buyer@example.test','Alex Attendee','name');
 IF changed.holder_name<>'Alex Attendee' OR changed.transfer_version<>0 THEN
  RAISE EXCEPTION 'Attendee rename failed'; END IF;
 SELECT * INTO changed FROM public.sb_manage_named_event_ticket(
   ticket,'buyer@example.test','friend@example.test','Friend Attendee','transfer');
 IF changed.holder_email<>'friend@example.test' OR changed.transfer_version<>1 THEN
  RAISE EXCEPTION 'Ticket ownership transfer failed'; END IF;
 BEGIN
  PERFORM public.sb_manage_named_event_ticket(ticket,'buyer@example.test','other@example.test','Other Friend','transfer');
  RAISE EXCEPTION 'Previous holder can still transfer ticket';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT public.sb_checkin_event_ticket_versioned(ticket,actor,0) INTO old_scan;
 IF old_scan->>'status'<>'invalid' THEN RAISE EXCEPTION 'Old transferred QR still admits entry %',old_scan; END IF;
 SELECT public.sb_checkin_event_ticket_versioned(ticket,actor,1) INTO new_scan;
 IF new_scan->>'status'<>'valid' THEN RAISE EXCEPTION 'New QR check-in failed %',new_scan; END IF;
 BEGIN
  PERFORM public.sb_manage_named_event_ticket(ticket,'friend@example.test','buyer@example.test','Return Ticket','transfer');
  RAISE EXCEPTION 'Already-used ticket can be transferred';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF has_function_privilege('anon','public.sb_manage_named_event_ticket(uuid,text,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.sb_manage_named_event_ticket(uuid,text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Ticket mutation RPC accessible by public accounts'; END IF;
 IF has_function_privilege('anon','public.sb_checkin_event_ticket_versioned(uuid,uuid,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'Versioned scanner RPC accessible by anonymous account'; END IF;
END $$;
ROLLBACK;
