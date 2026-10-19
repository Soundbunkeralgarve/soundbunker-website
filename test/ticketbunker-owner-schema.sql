begin;
do $$
declare actor uuid:=gen_random_uuid();client_user uuid:=gen_random_uuid();org uuid;quote jsonb;allowed boolean;ev uuid;tier uuid;
begin
 insert into auth.users(id,email,email_confirmed_at) values(actor,'owner-'||actor||'@example.test',now()),(client_user,'client-'||client_user||'@example.test',now());
 insert into public.tb_platform_admins(email) values('owner-'||actor||'@example.test');
 insert into public.sb_event_organisers(owner_user_id,display_name,country_code) values(client_user,'Synthetic QA organiser','PT') returning id into org;
 if (select status from public.sb_event_organisers where id=org)<>'approved' then raise exception 'New organiser incorrectly waits for account approval';end if;
 begin perform public.tb_update_client(client_user,org,'Synthetic QA organiser','approved',100,null,'QA test');raise exception 'ASSERT client can grant free account';exception when others then if SQLERRM like 'ASSERT%' then raise;end if;end;
 perform public.tb_update_client(actor,org,'Synthetic QA organiser','approved',100,now()+interval '1 day','QA free listing');
 quote:=public.tb_reserve_events(gen_random_uuid(),client_user,'event_plus','eur',1);
 if (quote->>'total_cents')::int<>0 or (quote->>'discount_cents')::int<>39900 then raise exception 'Free account did not waive fixed fee';end if;
 quote:=public.tb_reserve_events(gen_random_uuid(),client_user,'usage','eur',1);
 if (quote->>'total_cents')::int<>39900 or (quote->>'included_tickets')::int<>2000 then raise exception 'Free fixed listing account waived separately agreed larger event';end if;

 insert into public.sb_events(slug,title,organiser_profile_id,status,starts_at,ends_at) values('owner-qa-'||gen_random_uuid()::text,'Owner Free Listing QA',org,'draft',now()+interval '2 hours',now()+interval '8 hours') returning id into ev;
 insert into public.sb_event_tiers(event_id,name,price_cents,quantity_total) values(ev,'General',2000,90) returning id into tier;
 begin update public.sb_events set status='published' where id=ev;raise exception 'ASSERT free listing bypasses verification';exception when others then if SQLERRM like 'ASSERT%' then raise;end if;end;
 update public.sb_event_organisers set stripe_account_id='acct_synthetic_no_network',stripe_capabilities_ready=true,tax_review_complete=true where id=org;
 perform public.tb_update_client(actor,org,'Synthetic QA organiser','suspended',100,null,'QA suspend account');
 begin update public.sb_events set status='published' where id=ev;raise exception 'ASSERT suspended account can publish';exception when others then if SQLERRM like 'ASSERT%' then raise;end if;end;
 perform public.tb_update_client(actor,org,'Synthetic QA organiser','approved',100,null,'QA restore account');
 update public.sb_events set status='published' where id=ev;
 quote:=public.sb_capacity_quote(client_user,ev,tier,500);
 if (quote->>'amountCents')::int<>0 then raise exception 'Free account capacity quote charged listing fee';end if;
 update public.tb_client_controls set valid_until=now()-interval '1 hour' where organiser_id=org;
 quote:=public.tb_reserve_events(gen_random_uuid(),client_user,'standard','gbp',1);
 if (quote->>'total_cents')::int<>19900 then raise exception 'Expired account offer remained active';end if;
 if not exists(select 1 from public.tb_admin_audit where target=org) then raise exception 'Account audit missing';end if;
 for i in 1..3 loop allowed:=public.tb_allow_password_reset(repeat('a',64),repeat('b',64));if not allowed then raise exception 'Rate limit too early';end if;end loop;
 if public.tb_allow_password_reset(repeat('a',64),repeat('b',64)) then raise exception 'Password reset rate limit missing';end if;
 if has_table_privilege('anon','public.tb_email_campaigns','SELECT') or has_table_privilege('authenticated','public.tb_client_controls','UPDATE') or has_function_privilege('authenticated','public.tb_update_client(uuid,uuid,text,text,integer,timestamptz,text)','EXECUTE') then raise exception 'Owner tables or functions exposed';end if;
end $$;
rollback;
