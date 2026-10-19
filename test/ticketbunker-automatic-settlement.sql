-- Transaction-only fixtures: no event, order, email or payment survives this check.
begin;
do $$
declare ev uuid:=gen_random_uuid();future_ev uuid:=gen_random_uuid();test_ev uuid:=gen_random_uuid();tier uuid:=gen_random_uuid();paid_order uuid:=gen_random_uuid();refunded_order uuid:=gen_random_uuid();buyer uuid:=gen_random_uuid();r public.tb_event_reports;
begin
 insert into auth.users(id,email,email_confirmed_at)values(buyer,'tb-report-qa-'||buyer||'@example.invalid',now());
 insert into public.sb_events(id,slug,title,starts_at,ends_at,status)values(ev,'automatic-report-qa-'||ev,'Automatic report QA',now()-interval '3 hours',now()-interval '1 minute','published');
 insert into public.sb_events(id,slug,title,starts_at,ends_at,status)values(future_ev,'future-report-qa-'||future_ev,'Future report QA',now()+interval '1 hour',now()+interval '2 hours','published');
 insert into public.sb_events(id,slug,title,starts_at,ends_at,status,internal_free_test,test_code_hash,test_expires_at)values(test_ev,'internal-report-qa-'||test_ev,'Internal report QA',now()-interval '3 hours',now()-interval '1 minute','published',true,repeat('a',64),now()+interval '1 day');
 insert into public.sb_event_tiers(id,event_id,name,price_cents,quantity_total)values(tier,ev,'General admission',1000,10);
 insert into public.sb_event_orders(id,event_id,tier_id,customer_name,customer_email,quantity,total_cents,status,reserved_until,paid_at)values(paid_order,ev,tier,'Synthetic buyer','qa@example.invalid',2,2000,'paid',now(),now()),(refunded_order,ev,tier,'Synthetic refund','qa@example.invalid',1,1000,'refunded',now(),now());
 insert into public.sb_event_tickets(order_id,event_id,tier_id,sequence_number,checked_in_at,checked_in_by)values(paid_order,ev,tier,1,now()-interval '1 hour',buyer),(paid_order,ev,tier,2,null,null);
 perform ticketbunker_private.generate_due_reports();perform ticketbunker_private.generate_due_reports();
 select * into r from public.tb_event_reports where event_id=ev;
 if not found or r.due_at<>r.ends_at or r.sold_tickets<>3 or r.gross_cents<>3000 or r.refunded_order_cents<>1000 or r.checked_in<>1 or r.not_scanned<>1 or jsonb_array_length(r.scanner_summary)<>1 or jsonb_array_length(r.tier_summary)<>1 then raise exception 'Automatic event-end report totals or detail are wrong';end if;
 if (select count(*) from public.tb_event_reports where event_id=ev)<>1 then raise exception 'Duplicate report';end if;
 if exists(select 1 from public.tb_event_reports where event_id in(future_ev,test_ev)) then raise exception 'Future or internal test event reported';end if;
 insert into public.tb_refund_requests(order_id,event_id,requested_by,reason)values(paid_order,ev,buyer,'Synthetic refund review fixture');
 if public.tb_claim_event_release(ev,gen_random_uuid()) then raise exception 'Refund review failed to hold payout';end if;
 update public.tb_refund_requests set status='declined' where event_id=ev;
 if not public.tb_claim_event_release(ev,gen_random_uuid()) then raise exception 'Report should allow release immediately after event end';end if;
 if public.tb_claim_event_release(ev,gen_random_uuid()) then raise exception 'Concurrent release was allowed';end if;
 if public.tb_claim_event_release(future_ev,gen_random_uuid()) then raise exception 'Future event release allowed';end if;
 if has_function_privilege('anon','public.tb_select_event_payout(uuid,uuid,text)','EXECUTE') or has_function_privilege('authenticated','public.tb_select_event_payout(uuid,uuid,text)','EXECUTE') then raise exception 'Client can choose payout without server owner verification';end if;
end $$;
rollback;
select 'Event-end snapshot, detailed totals, idempotency, future/test exclusion, refund hold, release lock and service-only access passed; fixtures rolled back' as verification;
