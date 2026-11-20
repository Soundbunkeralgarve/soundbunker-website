-- TicketBunker prepaid event bundles (Nov 2026).
-- An organiser pays a 5- or 10-event bundle upfront through Stripe Checkout. The bundle is invoiced
-- once, and each event listing then draws one prepaid event instead of a separate listing payment,
-- so those listings are never invoiced a second time. Bundles run for 12 months from payment.
alter table public.tb_event_prebookings add column if not exists organiser_id uuid references public.sb_event_organisers(id);
alter table public.tb_event_prebookings add column if not exists stripe_session_id text;
alter table public.tb_event_prebookings add column if not exists paid_at timestamptz;
alter table public.tb_event_prebookings add column if not exists valid_until timestamptz;
alter table public.tb_event_prebookings add column if not exists events_used integer not null default 0;
alter table public.tb_event_prebookings drop constraint if exists tb_event_prebookings_status_check;
alter table public.tb_event_prebookings add constraint tb_event_prebookings_status_check check(status in ('requested','approved','paid','cancelled'));
alter table public.tb_event_prebookings drop constraint if exists tb_event_prebookings_events_used_check;
alter table public.tb_event_prebookings add constraint tb_event_prebookings_events_used_check check(events_used between 0 and event_count);
alter table public.tb_event_prebookings drop constraint if exists tb_event_prebookings_paid_check;
alter table public.tb_event_prebookings add constraint tb_event_prebookings_paid_check check(status<>'paid' or (paid_at is not null and valid_until is not null and organiser_id is not null and stripe_session_id is not null and plan<>'usage'));
create unique index if not exists tb_event_prebookings_session_idx on public.tb_event_prebookings(stripe_session_id) where stripe_session_id is not null;

alter table public.sb_event_listing_fees add column if not exists prebooking_id uuid references public.tb_event_prebookings(id);
-- A bundle invoice belongs to the organiser, not to one event.
alter table public.tb_organiser_invoices alter column event_id drop not null;

-- Confirms a paid bundle checkout. Stripe values are passed in by the verified webhook.
create or replace function public.tb_mark_bundle_paid(p_id uuid,p_session text,p_amount integer,p_currency text)
returns text language plpgsql security invoker set search_path='' as $$
declare b public.tb_event_prebookings;
begin
 if coalesce(auth.role(),'')<>'service_role' and current_user<>'postgres' then raise exception 'Service access required';end if;
 select * into b from public.tb_event_prebookings where id=p_id for update;
 if not found or b.stripe_session_id is distinct from p_session or b.total_cents<>p_amount or b.currency<>p_currency or b.plan='usage' then raise exception 'Bundle payment mismatch';end if;
 if b.status='paid' then return 'paid';end if;
 if b.status not in ('requested','approved') then return 'needs_attention';end if;
 update public.tb_event_prebookings set status='paid',paid_at=now(),valid_until=now()+interval '12 months' where id=p_id;
 return 'paid';
end;$$;

-- Uses one prepaid bundle event for a draft listing. Returns null when no bundle fits.
create or replace function public.tb_use_listing_bundle(p_event uuid,p_owner uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.sb_events;b public.tb_event_prebookings;org uuid;capacity integer;needed integer;fee public.sb_event_listing_fees;
 names text[]:=array['mini','starter','club','standard','headline','event_plus'];caps integer[]:=array[50,100,250,500,1000,2000];
begin
 if coalesce(auth.role(),'')<>'service_role' and current_user<>'postgres' then raise exception 'Service access required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event::text,401));
 select id into org from public.sb_event_organisers where owner_user_id=p_owner and status='approved';
 select * into e from public.sb_events where id=p_event and organiser_profile_id=org;
 if org is null or not found or e.status<>'draft' then raise exception 'Event must be a valid draft';end if;
 if exists(select 1 from public.sb_event_listing_fees where event_id=p_event and status='paid') then raise exception 'This event listing has already been paid';end if;
 if exists(select 1 from public.sb_event_listing_fees where event_id=p_event and status='pending' and created_at>now()-interval '37 minutes') then raise exception 'A listing checkout is already pending. Please use the existing session or try later.';end if;
 select coalesce(sum(quantity_total),0) into capacity from public.sb_event_tiers where event_id=p_event;
 select min(i) into needed from generate_subscripts(caps,1) i where caps[i]>=capacity;
 if capacity<1 or needed is null then return null;end if;
 select * into b from public.tb_event_prebookings where owner_user_id=p_owner and status='paid' and currency=e.currency and valid_until>now()
  and events_used<event_count and array_position(names,plan)>=needed
  order by array_position(names,plan),valid_until limit 1 for update;
 if not found then return null;end if;
 update public.tb_event_prebookings set events_used=events_used+1 where id=b.id;
 insert into public.sb_event_listing_fees(event_id,organiser_profile_id,tier_code,amount_cents,currency,status,paid_at,prebooking_id)
 values(p_event,org,b.plan,greatest(1,round(b.total_cents::numeric/b.event_count))::integer,e.currency,'paid',now(),b.id) returning * into fee;
 return jsonb_build_object('bundleId',b.id,'plan',b.plan,'remaining',b.event_count-b.events_used-1,'validUntil',b.valid_until,'listingId',fee.id);
end;$$;

create or replace function public.tb_queue_organiser_bundle_invoice(p_bundle uuid)
returns void language plpgsql set search_path='' as $$
declare b public.tb_event_prebookings;
begin
 select * into b from public.tb_event_prebookings where id=p_bundle and status='paid';
 if not found or b.total_cents<=0 then return;end if;
 if exists(select 1 from public.tb_organiser_billing x where x.organiser_profile_id=b.organiser_id and regexp_replace(coalesce(x.vat_number,''),'[^0-9]','','g')='517757478') then return;end if;
 insert into public.tb_organiser_invoices(source_key,organiser_id,event_id,category,description,amount_cents,currency,paid,document_type,stripe_session_id)
 values('bundle:'||b.id,b.organiser_id,null,'service','Event listing bundle: '||b.event_count||' prepaid '||initcap(replace(b.plan,'_',' '))||' events, valid 12 months',b.total_cents,b.currency,true,'invoice_receipts',b.stripe_session_id)
 on conflict(source_key) do nothing;
end $$;

create or replace function public.tb_scan_organiser_invoices()
returns void language plpgsql set search_path='' as $$
declare r record;cutover timestamptz; begin perform pg_advisory_xact_lock(hashtextextended('tb_organiser_invoicing',1)); select enabled_at into cutover from public.tb_invoice_brands where brand='ticketbunker'; for r in select * from public.sb_event_listing_fees where status='paid' and paid_at>=cutover and prebooking_id is null loop perform public.tb_queue_organiser_invoice('listing:'||r.id,r.event_id,r.amount_cents,r.currency,'Event listing',true,r.stripe_session_id,'service'); end loop; for r in select * from public.tb_event_prebookings where status='paid' and paid_at>=cutover loop perform public.tb_queue_organiser_bundle_invoice(r.id); end loop; for r in select * from public.sb_capacity_changes where applied_at>=cutover and amount_cents>0 loop perform public.tb_queue_organiser_invoice('capacity:'||r.id,r.event_id,r.amount_cents,r.currency,'Event capacity upgrade',true,r.stripe_session_id,'service'); end loop; for r in select * from public.sb_event_showcase_requests where paid_at>=cutover loop perform public.tb_queue_organiser_invoice('promotion:'||r.id,r.event_id,r.proposed_amount_cents,r.currency,'Featured event promotion',true,r.stripe_session_id,'service'); end loop; for r in select * from public.tb_event_cancellations where paid_at>=cutover loop perform public.tb_queue_organiser_invoice('cancellation:'||r.event_id,r.event_id,r.fee_cents,r.fee_currency,'Event cancellation administration',true,r.stripe_session_id,'service'); end loop; for r in select * from public.tb_event_postponements where paid_at>=cutover or fee_refunded_at>=cutover loop perform public.tb_queue_organiser_invoice('postponement:'||r.id,r.event_id,1000,'gbp','Event postponement administration',true,r.stripe_session_id,'service'); end loop; for r in select s.*,e.currency from public.tb_event_settlements s join public.sb_events e on e.id=s.event_id where s.reconciled_at>=cutover and s.payout_status in('processing','paid','ready') loop perform public.tb_queue_organiser_invoice('usage:'||r.event_id,r.event_id,r.usage_fee_cents,r.currency,'Additional event listing usage',true,null,'service'); perform public.tb_queue_organiser_invoice('processing:'||r.event_id,r.event_id,r.processing_fee_cents,r.currency,'Payment processing costs retained from event proceeds',true,null,'processing'); end loop; for r in select f.* from public.tb_cancellation_refunds f join public.sb_events e on e.id=f.event_id left join public.tb_event_settlements s on s.event_id=e.id where f.updated_at>=cutover and f.refund_status='refunded' and f.fee_cents is not null and (e.status='cancelled' or s.payout_status in('processing','paid','ready')) loop perform public.tb_queue_organiser_invoice('refund-cost:'||r.order_id,r.event_id,greatest(0,r.fee_cents-r.recovered_fee_cents),r.fee_currency,'Unrecovered event refund processing costs',false,null,'processing'); end loop; end $$;

revoke all on function public.tb_mark_bundle_paid(uuid,text,integer,text) from public,anon,authenticated;
revoke all on function public.tb_use_listing_bundle(uuid,uuid) from public,anon,authenticated;
revoke all on function public.tb_queue_organiser_bundle_invoice(uuid) from public,anon,authenticated;
revoke all on function public.tb_scan_organiser_invoices() from public,anon,authenticated;
grant execute on function public.tb_mark_bundle_paid(uuid,text,integer,text) to service_role;
grant execute on function public.tb_use_listing_bundle(uuid,uuid) to service_role;
grant execute on function public.tb_queue_organiser_bundle_invoice(uuid) to service_role;
grant execute on function public.tb_scan_organiser_invoices() to service_role;
