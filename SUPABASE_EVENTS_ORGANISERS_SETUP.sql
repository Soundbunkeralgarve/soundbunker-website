-- SoundBunker Events marketplace: additive UK/PT organiser pilot schema.
-- Organiser accounts and event drafts; all third-party publishing remains gated.
create table if not exists public.sb_event_organisers(
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null unique references auth.users(id),
 display_name text not null check (char_length(display_name) between 2 and 160),
 country_code text not null check (country_code in ('PT','GB')),
 status text not null default 'pending_review'
   check(status in ('pending_review','approved','suspended')),
 stripe_account_id text unique,
 stripe_capabilities_ready boolean not null default false,
 tax_review_complete boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.sb_event_organisers enable row level security;
revoke all on public.sb_event_organisers from public,anon,authenticated;
grant all on public.sb_event_organisers to service_role;

alter table public.sb_events
 add column if not exists organiser_profile_id uuid references public.sb_event_organisers(id),
 add column if not exists country_code text not null default 'PT',
 add column if not exists venue_timezone text not null default 'Europe/Lisbon',
 add column if not exists currency text not null default 'eur',
 add column if not exists event_kind text not null default 'show';
alter table public.sb_events drop constraint if exists sb_event_country_check;
alter table public.sb_events add constraint sb_event_country_check check (country_code in ('PT','GB'));
alter table public.sb_events drop constraint if exists sb_event_currency_check;
alter table public.sb_events add constraint sb_event_currency_check check (
 (country_code='PT' and currency='eur') or (country_code='GB' and currency='gbp')
);
alter table public.sb_events drop constraint if exists sb_event_timezone_check;
alter table public.sb_events add constraint sb_event_timezone_check check (
 (country_code='PT' and venue_timezone in ('Europe/Lisbon','Atlantic/Azores','Atlantic/Madeira')) or
 (country_code='GB' and venue_timezone='Europe/London')
);
alter table public.sb_events drop constraint if exists sb_event_kind_check;
alter table public.sb_events add constraint sb_event_kind_check check(event_kind in ('show','festival','workshop','club','community'));
create index if not exists sb_events_organiser_idx on public.sb_events(organiser_profile_id,starts_at);

alter table public.sb_event_orders
 add column if not exists currency text not null default 'eur',
 add column if not exists stripe_connected_account text;
alter table public.sb_event_orders drop constraint if exists sb_event_order_currency_check;
alter table public.sb_event_orders add constraint sb_event_order_currency_check check(currency in ('eur','gbp'));

create table if not exists public.sb_event_listing_fees(
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.sb_events(id),
 organiser_profile_id uuid not null references public.sb_event_organisers(id),
 tier_code text not null check(tier_code in ('starter','standard','festival')),
 amount_cents integer not null check(amount_cents > 0),
 currency text not null check(currency in ('eur','gbp')),
 status text not null default 'pending' check(status in ('pending','paid','expired','refunded','needs_attention')),
 stripe_session_id text unique,
 paid_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists sb_listing_event_status_idx on public.sb_event_listing_fees(event_id,status);
alter table public.sb_event_listing_fees enable row level security;
revoke all on public.sb_event_listing_fees from public,anon,authenticated;
grant all on public.sb_event_listing_fees to service_role;

-- Public event listings remain readable; private organiser details never exposed.
-- A positive listing payment by itself never authorises publishing.
create or replace function public.sb_event_publish_controls()
returns trigger language plpgsql security invoker set search_path='' as $$
declare organiser record;
begin
 if old.organiser_profile_id is distinct from new.organiser_profile_id
    and old.status<>'draft'
 then raise exception 'Cannot change event merchant after publishing'; end if;
 if old.status='published'
    and (old.currency<>new.currency or old.country_code<>new.country_code or
         old.venue_timezone<>new.venue_timezone or old.starts_at<>new.starts_at)
 then raise exception 'Cannot change financial or admission details of a published event'; end if;
 if new.organiser_profile_id is not null and new.status='published' and old.status<>'published' then
   select status,stripe_account_id,stripe_capabilities_ready,tax_review_complete
   into organiser from public.sb_event_organisers where id=new.organiser_profile_id;
   if not found or organiser.status<>'approved' or organiser.stripe_account_id is null
      or not organiser.stripe_capabilities_ready or not organiser.tax_review_complete
   then raise exception 'Organiser approval, tax review and Stripe connection required'; end if;
   if not exists(select 1 from public.sb_event_listing_fees
     where event_id=new.id and organiser_profile_id=new.organiser_profile_id and status='paid')
   then raise exception 'Listing fee must be paid before publishing'; end if;
 end if;
 return new;
end $$;
drop trigger if exists sb_event_publish_controls_trg on public.sb_events;
create trigger sb_event_publish_controls_trg before update on public.sb_events
for each row execute function public.sb_event_publish_controls();
revoke all on function public.sb_event_publish_controls() from public,anon,authenticated;

-- Keep event data and revenue in one currency. Existing internal EUR tickets remain valid.
create or replace function public.sb_reserve_event_tickets(p_tier uuid,p_name text,p_email text,p_quantity integer)
returns public.sb_event_orders language plpgsql security invoker set search_path='' as $$
declare t record; used_count bigint; created public.sb_event_orders;
begin
 if p_quantity is null or p_quantity<1 or p_quantity>8 then raise exception 'Invalid ticket quantity'; end if;
 select t0.id,t0.event_id,t0.price_cents,t0.quantity_total,e.starts_at,e.status,e.currency
 into t from public.sb_event_tiers t0 join public.sb_events e on e.id=t0.event_id
 where t0.id=p_tier for update of t0;
 if not found or t.status<>'published' or t.starts_at<=now() then raise exception 'Tickets unavailable'; end if;
 select coalesce(sum(quantity),0) into used_count from public.sb_event_orders
 where tier_id=p_tier and (status='paid' or (status='reserved' and reserved_until>now()) or status='needs_attention');
 if used_count+p_quantity>t.quantity_total then raise exception 'Not enough tickets remaining'; end if;
 insert into public.sb_event_orders(event_id,tier_id,customer_name,customer_email,quantity,total_cents,reserved_until,currency)
 values(t.event_id,p_tier,p_name,p_email,p_quantity,t.price_cents*p_quantity,now()+interval '35 minutes',t.currency)
 returning * into created;
 return created;
end $$;
revoke all on function public.sb_reserve_event_tickets(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.sb_reserve_event_tickets(uuid,text,text,integer) to service_role;
