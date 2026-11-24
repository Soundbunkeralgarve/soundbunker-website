-- TicketBunker advertising: banners bought by venues, promoters and brands.
-- pending_payment → (Stripe paid) review → approved (live between starts_at and ends_at)
--                                        → refunded (turned down; refunded in full)
-- Only the service role reads or writes; the public sees approved banners through the API.
create table if not exists public.tb_ad_bookings(
 id uuid primary key default gen_random_uuid(),
 status text not null default 'pending_payment' check(status in ('pending_payment','review','approved','refunded','expired')),
 package text not null check(package in ('city','home','everywhere')),
 weeks int not null check(weeks in (1,2,4,8)),
 currency text not null check(currency in ('eur','gbp')),
 amount_cents int not null check(amount_cents>0),
 country_code text not null check(country_code ~ '^[A-Z]{2}$'),
 city_slug text check(city_slug ~ '^[a-z0-9-]{1,60}$'),
 business_name text not null check(length(business_name) between 2 and 80),
 contact_email text not null check(contact_email=lower(contact_email) and length(contact_email)<=200),
 headline text not null check(length(headline) between 3 and 60),
 body text not null check(length(body) between 3 and 160),
 cta text not null check(length(cta) between 2 and 24),
 link_url text not null check(link_url ~ '^https://' and length(link_url)<=500),
 image_url text not null check(image_url ~ '^https://' and length(image_url)<=500),
 requested_start date not null,
 starts_at timestamptz,
 ends_at timestamptz,
 stripe_session_id text unique check(stripe_session_id ~ '^cs_[A-Za-z0-9_]+$'),
 stripe_payment_intent text check(stripe_payment_intent ~ '^pi_[A-Za-z0-9]+$'),
 stripe_refund_id text check(stripe_refund_id ~ '^re_[A-Za-z0-9]+$'),
 paid_at timestamptz,
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 review_note text check(length(review_note)<=300),
 created_at timestamptz not null default now(),
 check(package<>'city' or city_slug is not null),
 check(status<>'approved' or (starts_at is not null and ends_at>starts_at and paid_at is not null))
);
create index if not exists tb_ad_bookings_live on public.tb_ad_bookings(status,ends_at);
create index if not exists tb_ad_bookings_email on public.tb_ad_bookings(contact_email,created_at);
alter table public.tb_ad_bookings enable row level security;
revoke all on public.tb_ad_bookings from anon,authenticated;
grant all on public.tb_ad_bookings to service_role;
