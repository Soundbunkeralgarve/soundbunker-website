-- TicketBunker premium beta: additive event metadata, branded tickets and photo uploads.
-- No checkout, Stripe or existing SoundBunker service tables are changed.
alter table public.sb_event_organisers add column if not exists logo_url text;
alter table public.sb_events add column if not exists headline_artist text;
alter table public.sb_events add column if not exists venue_city text;
alter table public.sb_events add column if not exists admission_info text;
alter table public.sb_events add column if not exists event_logo_url text;
alter table public.sb_events drop constraint if exists sb_event_kind_check;
alter table public.sb_events add constraint sb_event_kind_check check (event_kind in (
 'show','live_music','club','festival','comedy','theatre','conference','arts',
 'sports','family','food','workshop','community','other'
));
create index if not exists sb_event_city_discovery_idx on public.sb_events (lower(venue_city),starts_at) where status='published';
create index if not exists sb_event_order_wallet_idx on public.sb_event_orders(lower(customer_email),status);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ticket-bunker-media','ticket-bunker-media',true,4194304,array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do nothing;
-- Writes go through a verified organiser-scoped server endpoint using service_role only.
