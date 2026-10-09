-- SoundBunker Events v1: run only after reviewing this additive migration.
create table if not exists public.sb_events (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 title text not null check (char_length(title) between 3 and 160),
 description text not null default '',
 organiser text not null default 'SoundBunker Algarve',
 venue text not null default 'The Hub Culture, Loulé',
 image_url text,
 starts_at timestamptz not null,
 ends_at timestamptz,
 status text not null default 'draft' check (status in ('draft','published','cancelled')),
 created_at timestamptz not null default now()
);
create table if not exists public.sb_event_tiers (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.sb_events(id) on delete cascade,
 name text not null,
 price_cents integer not null check (price_cents >= 100 and price_cents <= 10000000),
 quantity_total integer not null check (quantity_total between 1 and 100000),
 created_at timestamptz not null default now()
);
create table if not exists public.sb_event_orders (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.sb_events(id),
 tier_id uuid not null references public.sb_event_tiers(id),
 customer_name text not null,
 customer_email text not null,
 quantity integer not null check (quantity between 1 and 8),
 total_cents integer not null check (total_cents >= 100),
 status text not null default 'reserved' check (status in ('reserved','paid','cancelled','needs_attention')),
 reserved_until timestamptz not null,
 stripe_session_id text unique,
 paid_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.sb_event_tickets (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.sb_event_orders(id),
 event_id uuid not null references public.sb_events(id),
 tier_id uuid not null references public.sb_event_tiers(id),
 sequence_number integer not null check (sequence_number between 1 and 8),
 checked_in_at timestamptz,
 checked_in_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(order_id,sequence_number)
);
create index if not exists sb_event_orders_capacity_idx on public.sb_event_orders(tier_id,status,reserved_until);
create index if not exists sb_event_tickets_event_idx on public.sb_event_tickets(event_id,checked_in_at);
create index if not exists sb_events_date_idx on public.sb_events(starts_at) where status='published';

alter table public.sb_events enable row level security;
alter table public.sb_event_tiers enable row level security;
alter table public.sb_event_orders enable row level security;
alter table public.sb_event_tickets enable row level security;
revoke all on public.sb_events,public.sb_event_tiers,public.sb_event_orders,public.sb_event_tickets from public,anon,authenticated;
grant select on public.sb_events,public.sb_event_tiers to anon,authenticated;
grant all on public.sb_events,public.sb_event_tiers,public.sb_event_orders,public.sb_event_tickets to service_role;
drop policy if exists "Published event list" on public.sb_events;
create policy "Published event list" on public.sb_events for select to anon,authenticated using (status='published' and starts_at>now()-interval '1 day');
drop policy if exists "Published ticket tiers" on public.sb_event_tiers;
create policy "Published ticket tiers" on public.sb_event_tiers for select to anon,authenticated
 using (exists (select 1 from public.sb_events e where e.id=event_id and e.status='published' and e.starts_at>now()-interval '1 day'));

create or replace function public.sb_reserve_event_tickets(p_tier uuid,p_name text,p_email text,p_quantity integer)
returns public.sb_event_orders language plpgsql security invoker set search_path = '' as $$
declare t record; used_count bigint; created public.sb_event_orders;
begin
 if p_quantity is null or p_quantity<1 or p_quantity>8 then raise exception 'Invalid ticket quantity'; end if;
 select t0.id,t0.event_id,t0.price_cents,t0.quantity_total,e.starts_at,e.status
 into t from public.sb_event_tiers t0 join public.sb_events e on e.id=t0.event_id
 where t0.id=p_tier for update of t0;
 if not found or t.status<>'published' or t.starts_at<=now() then raise exception 'Tickets unavailable'; end if;
 select coalesce(sum(quantity),0) into used_count from public.sb_event_orders
 where tier_id=p_tier and (status='paid' or (status='reserved' and reserved_until>now()) or status='needs_attention');
 if used_count+p_quantity>t.quantity_total then raise exception 'Not enough tickets remaining'; end if;
 insert into public.sb_event_orders(event_id,tier_id,customer_name,customer_email,quantity,total_cents,reserved_until)
 values(t.event_id,p_tier,p_name,p_email,p_quantity,t.price_cents*p_quantity,now()+interval '35 minutes')
 returning * into created;
 return created;
end $$;

create or replace function public.sb_confirm_event_order(p_order uuid,p_session text)
returns text language plpgsql security invoker set search_path = '' as $$
declare o public.sb_event_orders; cap integer; used_count bigint;
begin
 select * into o from public.sb_event_orders where id=p_order;
 if not found then raise exception 'Event order not found'; end if;
 select quantity_total into cap from public.sb_event_tiers where id=o.tier_id for update;
 select * into o from public.sb_event_orders where id=p_order for update;
 if o.status='paid' then
   if o.stripe_session_id=p_session then return 'paid'; end if;
   raise exception 'Session mismatch';
 end if;
 if o.status<>'reserved' or (o.stripe_session_id is not null and o.stripe_session_id<>p_session)
 then raise exception 'Order not reservable'; end if;
 select coalesce(sum(quantity),0) into used_count from public.sb_event_orders
 where tier_id=o.tier_id and id<>o.id and
 (status='paid' or status='needs_attention' or (status='reserved' and reserved_until>now()));
 if used_count+o.quantity>cap then
   update public.sb_event_orders set status='needs_attention',stripe_session_id=p_session where id=o.id;
   return 'needs_attention';
 end if;
 update public.sb_event_orders set status='paid',stripe_session_id=p_session,paid_at=now() where id=o.id;
 insert into public.sb_event_tickets(order_id,event_id,tier_id,sequence_number)
 select o.id,o.event_id,o.tier_id,n from generate_series(1,o.quantity) as n
 on conflict (order_id,sequence_number) do nothing;
 return 'paid';
end $$;

create or replace function public.sb_checkin_event_ticket(p_ticket uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare t record;
begin
 select tk.id,tk.checked_in_at, e.title,e.starts_at,e.status,tt.name as tier_name
 into t from public.sb_event_tickets tk
 join public.sb_events e on e.id=tk.event_id
 join public.sb_event_tiers tt on tt.id=tk.tier_id
 where tk.id=p_ticket for update of tk;
 if not found then return jsonb_build_object('status','invalid'); end if;
 if t.checked_in_at is not null then return jsonb_build_object('status','used','checked_in_at',t.checked_in_at,'event',t.title); end if;
 if t.status<>'published' or now()<t.starts_at-interval '18 hours' or now()>t.starts_at+interval '36 hours'
 then return jsonb_build_object('status','not_open','event',t.title); end if;
 update public.sb_event_tickets set checked_in_at=now(),checked_in_by=p_actor where id=p_ticket and checked_in_at is null;
 return jsonb_build_object('status','valid','event',t.title,'tier',t.tier_name);
end $$;
revoke all on function public.sb_reserve_event_tickets(uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.sb_confirm_event_order(uuid,text) from public,anon,authenticated;
revoke all on function public.sb_checkin_event_ticket(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sb_reserve_event_tickets(uuid,text,text,integer) to service_role;
grant execute on function public.sb_confirm_event_order(uuid,text) to service_role;
grant execute on function public.sb_checkin_event_ticket(uuid,uuid) to service_role;


-- Aggregate capacity in SQL, avoiding paginated client-side order counts.
create or replace function public.sb_event_inventory()
returns table(tier_id uuid,used_count bigint) language sql stable security invoker set search_path='' as $$
 select o.tier_id, coalesce(sum(o.quantity),0)::bigint
 from public.sb_event_orders o
 where o.status='paid' or o.status='needs_attention' or (o.status='reserved' and o.reserved_until>now())
 group by o.tier_id
$$;
revoke all on function public.sb_event_inventory() from public,anon,authenticated;
grant execute on function public.sb_event_inventory() to service_role;
