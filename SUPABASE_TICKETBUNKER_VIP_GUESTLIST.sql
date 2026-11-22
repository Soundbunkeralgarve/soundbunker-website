-- TicketBunker VIP guestlist spots. Run after SUPABASE_TICKETBUNKER_VIP.sql.
-- An organiser gives VIP members places by adding a normal guest-list allocation whose
-- artist email is vip@theticketbunker.com (no invitation is sent). A VIP member can then
-- claim one complimentary pass for themselves; it is issued exactly like an artist's
-- guest pass (same tier lock, quota and capacity checks, standard QR ticket).
create or replace function public.tb_claim_vip_guest_pass(p_allocation uuid,p_user uuid,p_request uuid,p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a record; ev record; t record; u record; existing record; used_count bigint; ord uuid; entry_id uuid; member_email text;
begin
 if coalesce(auth.role(),'')<>'service_role' and current_user<>'postgres' then raise exception 'Service access required';end if;
 select * into a from public.sb_guest_allocations where id=p_allocation;
 if not found or a.artist_email<>'vip@theticketbunker.com' then raise exception 'VIP guestlist unavailable';end if;
 -- Shared tier lock serializes paid reservations, allocation changes and free issuance.
 select * into t from public.sb_event_tiers where id=a.tier_id for update;
 select * into a from public.sb_guest_allocations where id=p_allocation for update;
 select * into ev from public.sb_events where id=a.event_id;
 select id,email into u from auth.users where id=p_user and email_confirmed_at is not null;
 if not found then raise exception 'Verified account required';end if;
 if not public.tb_is_vip(p_user) then raise exception 'VIP membership required';end if;
 if a.revoked_at is not null or ev.status<>'published' or ev.internal_free_test or ev.public_beta_test or coalesce(ev.ends_at,ev.starts_at+interval '12 hours')<=now() then raise exception 'Guest list has closed';end if;
 if p_request is null or p_name is null or length(trim(p_name)) not between 2 and 100 then raise exception 'Enter your name';end if;
 member_email:=lower(trim(u.email));
 -- One pass per member per event; a repeat claim returns the pass they already have.
 select g.*,o.status into existing from public.sb_guest_entries g join public.sb_event_orders o on o.id=g.order_id
 where g.allocation_id=a.id and g.guest_email=member_email limit 1;
 if found then
  if existing.status<>'paid' then raise exception 'Your VIP pass for this event was cancelled';end if;
  return existing.id;
 end if;
 select count(*) into used_count from public.sb_event_orders where guest_allocation_id=a.id and status in ('paid','needs_attention');
 if used_count>=a.quota then raise exception 'All VIP guestlist spots for this event are taken';end if;
 select coalesce(sum(quantity),0) into used_count from public.sb_event_orders where tier_id=a.tier_id and (status in ('paid','needs_attention') or (status='reserved' and reserved_until>now()));
 if used_count>=t.quantity_total then raise exception 'Event capacity reached';end if;
 insert into public.sb_event_orders(event_id,tier_id,customer_name,customer_email,quantity,total_cents,status,reserved_until,currency,paid_at,guest_allocation_id)
 values(a.event_id,a.tier_id,trim(p_name),member_email,1,0,'paid',now(),ev.currency,now(),a.id) returning id into ord;
 insert into public.sb_event_tickets(order_id,event_id,tier_id,sequence_number,holder_name,holder_email)
 values(ord,a.event_id,a.tier_id,1,trim(p_name),member_email);
 insert into public.sb_guest_entries(allocation_id,request_id,order_id,guest_name,guest_email)
 values(a.id,p_request,ord,trim(p_name),member_email) returning id into entry_id;
 return entry_id;
end $$;
revoke all on function public.tb_claim_vip_guest_pass(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.tb_claim_vip_guest_pass(uuid,uuid,uuid,text) to service_role;
