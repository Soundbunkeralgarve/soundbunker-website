-- Automatic post-show snapshots. No payment, transfer or payout is triggered here.
create extension if not exists pg_cron;
create schema if not exists ticketbunker_private;
revoke all on schema ticketbunker_private from public, anon, authenticated;

create table public.tb_event_reports (
 event_id uuid primary key references public.sb_events(id),
 due_at timestamptz not null,
 generated_at timestamptz not null default now(),
 event_title text not null,
 currency text not null check(currency in ('eur','gbp')),
 ends_at timestamptz not null,
 sold_tickets integer not null default 0,
 gross_cents bigint not null default 0,
 refunded_order_cents bigint not null default 0,
 checked_in integer not null default 0,
 not_scanned integer not null default 0,
 scanner_summary jsonb not null default '[]',
 tier_summary jsonb not null default '[]'
);
create table public.tb_event_settlements (
 event_id uuid primary key references public.sb_events(id),
 payout_option text not null default 'standard' check(payout_option in ('standard','fast')),
 fast_fee_status text not null default 'not_requested' check(fast_fee_status in ('not_requested','pending','paid','refunded')),
 fast_fee_cents bigint check(fast_fee_cents>=0),
 fast_fee_stripe_session_id text,
 processing_fee_cents bigint check(processing_fee_cents>=0),
 refunds_cents bigint check(refunds_cents>=0),
 adjustments_cents bigint,
 payout_amount_cents bigint check(payout_amount_cents>=0),
 payout_status text not null default 'awaiting_activation' check(payout_status in ('awaiting_activation','holding','reconciling','ready','processing','paid','failed','blocked')),
 stripe_payout_id text unique,
 stripe_arrival_at timestamptz,
 stripe_method text check(stripe_method in ('standard','instant')),
 reconciled_at timestamptz,
 updated_at timestamptz not null default now(),
 check(fast_fee_status <> 'paid' or (fast_fee_stripe_session_id is not null and fast_fee_cents is not null)),
 check(payout_amount_cents is null or reconciled_at is not null),
 check(payout_status not in ('processing','paid') or stripe_payout_id is not null)
);
create table public.tb_refund_requests (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.sb_event_orders(id),
 event_id uuid not null references public.sb_events(id),
 requested_by uuid not null references auth.users(id),
 reason text not null check(length(reason) between 10 and 1200),
 status text not null default 'requested' check(status in ('requested','reviewing','approved','processing','refunded','declined')),
 stripe_refund_id text,
 amount_cents bigint check(amount_cents>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(order_id,requested_by),
 check(status<>'refunded' or stripe_refund_id is not null)
);
alter table public.tb_event_reports enable row level security;
alter table public.tb_event_settlements enable row level security;
alter table public.tb_refund_requests enable row level security;
revoke all on public.tb_event_reports, public.tb_event_settlements, public.tb_refund_requests from anon,authenticated;
grant all on public.tb_event_reports, public.tb_event_settlements, public.tb_refund_requests to service_role;

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
select cron.schedule('ticketbunker-post-show-reports','* * * * *','select ticketbunker_private.generate_due_reports();');

-- Organiser profile editor; only the verified owner may update via the Edge API.
alter table public.sb_event_organisers add column if not exists public_profile jsonb not null default '{}'::jsonb;
