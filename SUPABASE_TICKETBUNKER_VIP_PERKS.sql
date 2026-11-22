-- TicketBunker VIP perks. Run after SUPABASE_TICKETBUNKER_VIP.sql.
-- Early access: until vip_presale_until, only VIP members can book the event online.
alter table public.sb_events add column if not exists vip_presale_until timestamptz;
alter table public.sb_events drop constraint if exists sb_events_vip_presale_check;
alter table public.sb_events add constraint sb_events_vip_presale_check check(vip_presale_until is null or vip_presale_until<starts_at);

-- Priority entry: is the ticket's current holder (after any name change or transfer) a VIP?
create or replace function public.tb_ticket_is_vip(p_ticket uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.sb_event_tickets t join public.sb_event_orders o on o.id=t.order_id
  join public.tb_vip_members m on m.email=lower(coalesce(t.holder_email,o.customer_email))
  where t.id=p_ticket and m.status in ('active','past_due','cancelled') and m.current_period_end>now());
$$;
revoke all on function public.tb_ticket_is_vip(uuid) from public,anon,authenticated;
grant execute on function public.tb_ticket_is_vip(uuid) to service_role;
