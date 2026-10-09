-- Disposable PostgreSQL test for event-scoped scanner invitations.
DO $$
DECLARE owner_id uuid:=gen_random_uuid();
 staff_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
 event_id uuid; other_event uuid; digest text:=repeat('a',64); selected_event uuid;
BEGIN
 INSERT INTO auth.users(id) VALUES(owner_id),(staff_id),(other_id);
 INSERT INTO public.sb_events(slug,title,starts_at,status)
 VALUES('staff-invite-test','Staff Test',now()+interval '2 days','draft') RETURNING id INTO event_id;
 INSERT INTO public.sb_events(slug,title,starts_at,status)
 VALUES('staff-other-test','Other event',now()+interval '2 days','draft') RETURNING id INTO other_event;
 INSERT INTO public.sb_event_staff_invites(event_id,invited_email,token_digest,invited_by)
 VALUES(event_id,'crew@example.com',digest,owner_id);
 BEGIN
  PERFORM public.sb_claim_staff_invite(digest,staff_id,'wrong@example.com');
  RAISE EXCEPTION 'A different email claimed the staff invite';
 EXCEPTION WHEN OTHERS THEN
  IF sqlerrm='A different email claimed the staff invite' THEN RAISE; END IF;
 END;
 SELECT public.sb_claim_staff_invite(digest,staff_id,'crew@example.com') INTO selected_event;
 IF selected_event<>event_id THEN RAISE EXCEPTION 'Claim returned wrong event'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sb_event_staff_access
  WHERE event_id=event_id AND user_id=staff_id AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Claim did not create access'; END IF;
 IF EXISTS(SELECT 1 FROM public.sb_event_staff_access WHERE event_id=other_event AND user_id=staff_id)
 THEN RAISE EXCEPTION 'Claim leaked access to a different event'; END IF;
 BEGIN
  PERFORM public.sb_claim_staff_invite(digest,other_id,'crew@example.com');
  RAISE EXCEPTION 'An already used invitation was reusable';
 EXCEPTION WHEN OTHERS THEN
  IF sqlerrm='An already used invitation was reusable' THEN RAISE; END IF;
 END;
 UPDATE public.sb_event_staff_access SET revoked_at=now() WHERE event_id=event_id AND user_id=staff_id;
 IF EXISTS(SELECT 1 FROM public.sb_event_staff_access
  WHERE event_id=event_id AND user_id=staff_id AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Revocation failed'; END IF;
END $$;
