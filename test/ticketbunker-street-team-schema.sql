-- Street Team referral tracking and reward isolation. All test rows rolled back.
BEGIN;
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); org_id uuid; ev uuid; tier uuid; promoter uuid;
        order_id uuid; attributed uuid; count_tests integer;
BEGIN
 INSERT INTO auth.users(id) VALUES(owner_id);
 INSERT INTO public.sb_event_organisers(owner_user_id,display_name,country_code)
 VALUES(owner_id,'Street Team QA','PT') RETURNING id INTO org_id;
 INSERT INTO public.sb_events(slug,title,organiser_profile_id,status,public_beta_test,beta_test_expires_at,starts_at)
 VALUES('street-team-qa-'||substr(gen_random_uuid()::text,1,8),'Street Team QA',org_id,'draft',true,
 now()+interval '48 hours',now()+interval '12 hours') RETURNING id INTO ev;
 INSERT INTO public.sb_event_tiers(event_id,name,price_cents,quantity_total)
 VALUES(ev,'General Admission',2500,100) RETURNING id INTO tier;
 INSERT INTO public.sb_event_street_team(event_id,organiser_profile_id,promoter_name,promoter_email,referral_code,
  reward_type,reward_goal,reward_description)
 VALUES(ev,org_id,'Promoter One','street@example.test','aabbccdd00112233',
  'vip_table',25,'VIP table for 4 after 25 confirmed paid tickets')
 RETURNING id INTO promoter;
 order_id:=public.sb_issue_public_beta_ticket_ref(tier,'Street Test','streetbuyer@example.test',2,'aabbccdd00112233');
 SELECT street_team_id INTO attributed FROM public.sb_event_orders WHERE id=order_id;
 IF attributed IS DISTINCT FROM promoter THEN RAISE EXCEPTION 'Referral was not attributed to the street team member'; END IF;
 SELECT count(*) INTO count_tests FROM public.sb_event_orders WHERE street_team_id=promoter AND beta_test_order=true;
 IF count_tests<>1 THEN RAISE EXCEPTION 'Test attribution is missing'; END IF;
 IF (SELECT price_cents FROM public.sb_event_tiers WHERE id=tier)<>2500 OR
    (SELECT total_cents FROM public.sb_event_orders WHERE id=order_id)<>0 THEN
    RAISE EXCEPTION 'Referral altered original pricing'; END IF;
 order_id:=public.sb_issue_public_beta_ticket_ref(tier,'No Ref','secondbuyer@example.test',1,'invalidtracking');
 SELECT street_team_id INTO attributed FROM public.sb_event_orders WHERE id=order_id;
 IF attributed IS NOT NULL THEN RAISE EXCEPTION 'Invalid referral was attributed'; END IF;
 IF has_table_privilege('anon','public.sb_event_street_team','SELECT') OR
    has_table_privilege('authenticated','public.sb_event_street_team','UPDATE') OR
    has_function_privilege('anon','public.sb_issue_public_beta_ticket_ref(uuid,text,text,integer,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Public grants on street team or ticket issuer'; END IF;
END $$;
ROLLBACK;
