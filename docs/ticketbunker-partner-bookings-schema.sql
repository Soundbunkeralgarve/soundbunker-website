-- Partner records are an account organiser, never native admission tickets.
-- Only the authenticated service writes customer-supplied metadata. Provider
-- confirmation states are reserved for a future verified supplier adapter.
create table public.tb_partner_bookings (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 source text not null default 'manual' check(source in ('manual','click')),
 provider_id text not null check(length(provider_id) between 1 and 100),
 provider_name text not null check(length(provider_name) between 1 and 100),
 title text not null check(length(title) between 1 and 220),
 starts_at timestamptz,
 venue text not null default '' check(length(venue)<=220),
 booking_url text not null default '' check(length(booking_url)<=4000),
 booking_reference text not null default '' check(length(booking_reference)<=180),
 listing_id text not null default '' check(length(listing_id)<=180),
 status text not null default 'saved' check(status in ('saved','customer_added','provider_confirmed','cancelled')),
 verification_source text not null default 'none' check(verification_source in ('none','customer','provider')),
 document_path text,
 document_name text not null default '' check(length(document_name)<=160),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,request_id),
 check((status='saved' and verification_source='none') or
       (status='customer_added' and verification_source='customer') or
       (status in ('provider_confirmed','cancelled') and verification_source='provider')),
 check(document_path is null or document_path like user_id::text||'/'||id::text||'/%')
);
create index tb_partner_bookings_owner_created on public.tb_partner_bookings(user_id,created_at desc);
create unique index tb_partner_bookings_unique_click on public.tb_partner_bookings(user_id,booking_url) where source='click';
alter table public.tb_partner_bookings enable row level security;
revoke all on public.tb_partner_bookings from public,anon,authenticated;
grant select on public.tb_partner_bookings to authenticated;
grant all on public.tb_partner_bookings to service_role;
create policy tb_partner_bookings_owner_read on public.tb_partner_bookings
 for select to authenticated using((select auth.uid())=user_id);

-- Downloads are short-lived signed URLs issued after the API checks ownership.
-- There are deliberately no anon/authenticated storage.objects policies.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('tb-partner-bookings','tb-partner-bookings',false,2000000,
        array['application/pdf','image/png','image/jpeg'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
                              allowed_mime_types=excluded.allowed_mime_types;
