-- Automatic reporting at event finish; selected payout follows reconciliation.
alter table public.tb_event_settlements
 add column if not exists fast_fee_consent_at timestamptz,
 add column if not exists payout_message text;
alter table public.tb_event_settlements drop constraint if exists tb_event_settlements_fast_fee_status_check;
alter table public.tb_event_settlements add constraint tb_event_settlements_fast_fee_status_check
 check(fast_fee_status in ('not_requested','pending','paid','refunded','deducted'));
create or replace function ticketbunker_private.generate_due_reports()
returns integer language plpgsql security invoker set search_path='' as $$
declare ev record; inserted integer:=0;
begin
 for ev in select e.* from public.sb_events e
  where e.status='published' and not e.internal_free_test and not e.public_beta_test
    and e.ends_at is not null and e.ends_at <= now()
    and not exists(select 1 from public.tb_event_reports r where r.event_id=e.id)
  order by e.ends_at limit 100
 loop
  insert into public.tb_event_reports(event_id,due_at,event_title,currency,ends_at,sold_tickets,gross_cents,refunded_order_cents,checked_in,not_scanned,scanner_summary,tier_summary)
  select ev.id,ev.ends_at,ev.title,ev.currency,ev.ends_at,
   coalesce((select sum(quantity) from public.sb_event_orders where event_id=ev.id and status in ('paid','refunded') and not beta_test_order and guest_allocation_id is null),0),
   coalesce((select sum(total_cents) from public.sb_event_orders where event_id=ev.id and status in ('paid','refunded') and not beta_test_order and guest_allocation_id is null),0),
   coalesce((select sum(total_cents) from public.sb_event_orders where event_id=ev.id and status='refunded' and not beta_test_order and guest_allocation_id is null),0),
   (select count(*) from public.sb_event_tickets t join public.sb_event_orders o on o.id=t.order_id where t.event_id=ev.id and o.status='paid' and not o.beta_test_order and o.guest_allocation_id is null and t.checked_in_at is not null),
   (select count(*) from public.sb_event_tickets t join public.sb_event_orders o on o.id=t.order_id where t.event_id=ev.id and o.status='paid' and not o.beta_test_order and o.guest_allocation_id is null and t.checked_in_at is null),
   coalesce((select jsonb_agg(to_jsonb(sc)) from (select coalesce(p.full_name,'Scanner') as name,count(*) as scans from public.sb_event_tickets t join public.sb_event_orders o on o.id=t.order_id left join public.profiles p on p.id=t.checked_in_by where t.event_id=ev.id and o.status='paid' and not o.beta_test_order and o.guest_allocation_id is null and t.checked_in_at is not null group by t.checked_in_by,p.full_name)sc),'[]'::jsonb),
   coalesce((select jsonb_agg(to_jsonb(tt)) from (select tier.name,coalesce(sum(o.quantity),0) as sold,coalesce(sum(o.total_cents),0) as gross_cents from public.sb_event_tiers tier left join public.sb_event_orders o on o.tier_id=tier.id and o.status in ('paid','refunded') and not o.beta_test_order and o.guest_allocation_id is null where tier.event_id=ev.id group by tier.id,tier.name)tt),'[]'::jsonb)
  on conflict(event_id) do nothing;
  if found then inserted:=inserted+1;end if;
  insert into public.tb_event_settlements(event_id)values(ev.id)on conflict do nothing;
 end loop;
 return inserted;
end $$;
revoke all on function ticketbunker_private.generate_due_reports() from public,anon,authenticated;

create or replace function public.tb_claim_event_release(p_event uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare e public.sb_events;s public.tb_event_settlements;
begin
 if current_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event::text,202));
 select * into e from public.sb_events where id=p_event for update;
 if not found or e.status<>'published' or e.internal_free_test or e.public_beta_test or e.ends_at is null or e.ends_at>now() or not exists(select 1 from public.tb_event_reports where event_id=p_event) then return false;end if;
 if exists(select 1 from public.tb_refund_requests where event_id=p_event and status in ('requested','reviewing','approved','processing')) then return false;end if;
 insert into public.tb_event_settlements(event_id)values(p_event)on conflict do nothing;
 select * into s from public.tb_event_settlements where event_id=p_event for update;
 if s.payout_status in ('processing','paid','blocked') or (s.release_started_at>now()-interval '5 minutes' and s.release_token<>p_token) then return false;end if;
 update public.tb_event_settlements set payout_status='reconciling',release_token=p_token,release_started_at=now() where event_id=p_event;
 return true;
end;$$;
revoke all on function public.tb_claim_event_release(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tb_claim_event_release(uuid,uuid) to service_role;

create or replace function public.tb_due_event_settlements()
returns table(event_id uuid) language sql stable security invoker set search_path='' as $$
 select r.event_id from public.tb_event_reports r join public.sb_events e on e.id=r.event_id left join public.tb_event_settlements s on s.event_id=r.event_id
 where e.status='published' and not e.internal_free_test and not e.public_beta_test and r.due_at<=now() and coalesce(s.payout_status,'holding') in ('awaiting_activation','holding','reconciling','ready') and (s.release_started_at is null or s.release_started_at<now()-interval '5 minutes')
 and not (s.reconciled_at is not null and s.payout_amount_cents=0)
 order by s.release_started_at nulls first,r.due_at limit 1;
$$;
revoke all on function public.tb_due_event_settlements() from public,anon,authenticated;
grant execute on function public.tb_due_event_settlements() to service_role;

-- Save the verified owner's choice under the same lock used by settlement.
create or replace function public.tb_select_event_payout(p_actor uuid,p_event uuid,p_option text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare e public.sb_events; s public.tb_event_settlements;
begin
 if current_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required';end if;
 if p_option not in ('standard','fast') then raise exception 'Choose a payout option';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event::text,202));
 select * into e from public.sb_events where id=p_event for update;
 if not found or e.ends_at is null or e.ends_at<=now() or e.status not in ('draft','published') or e.internal_free_test or e.public_beta_test
 or not exists(select 1 from public.sb_event_organisers o join auth.users u on u.id=o.owner_user_id where o.id=e.organiser_profile_id and o.owner_user_id=p_actor and o.status='approved' and o.tax_review_complete and o.stripe_capabilities_ready and u.email_confirmed_at is not null)
 then return false;end if;
 insert into public.tb_event_settlements(event_id,payout_status)values(p_event,'holding')on conflict do nothing;
 select * into s from public.tb_event_settlements where event_id=p_event for update;
 if s.release_token is not null or s.stripe_payout_id is not null or s.fast_fee_status in ('paid','deducted') or s.payout_status in ('processing','paid','blocked') then return false;end if;
 update public.tb_event_settlements set payout_option=p_option,fast_fee_consent_at=case when p_option='fast' then now() else null end,
 fast_fee_status=case when p_option='fast' then 'pending' else 'not_requested' end,fast_fee_cents=null,payout_message=null,updated_at=now() where event_id=p_event;
 return true;
end $$;
revoke all on function public.tb_select_event_payout(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.tb_select_event_payout(uuid,uuid,text) to service_role;
