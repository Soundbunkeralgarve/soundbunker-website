-- Run once in the Supabase SQL Editor for premium vouchers and Community 2.0.
-- This migration is additive and safe to run again.

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  buyer_user_id uuid references auth.users(id) on delete set null,
  buyer_email text,
  recipient_email text,
  recipient_name text,
  display_from text,
  purchaser_name text,
  phone text,
  message text,
  service_id text,
  service_name text,
  amount_eur numeric(10,2),
  currency text default 'EUR',
  stripe_session_id text,
  stripe_payment_intent_id text,
  purchased_at timestamptz default now(),
  expires_at timestamptz,
  status text default 'active',
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vouchers add column if not exists code text;
alter table public.vouchers add column if not exists buyer_user_id uuid references auth.users(id) on delete set null;
alter table public.vouchers add column if not exists buyer_email text;
alter table public.vouchers add column if not exists recipient_email text;
alter table public.vouchers add column if not exists recipient_name text;
alter table public.vouchers add column if not exists display_from text;
alter table public.vouchers add column if not exists purchaser_name text;
alter table public.vouchers add column if not exists phone text;
alter table public.vouchers add column if not exists message text;
alter table public.vouchers add column if not exists service_id text;
alter table public.vouchers add column if not exists service_name text;
alter table public.vouchers add column if not exists amount_eur numeric(10,2);
alter table public.vouchers add column if not exists currency text default 'EUR';
alter table public.vouchers add column if not exists stripe_session_id text;
alter table public.vouchers add column if not exists stripe_payment_intent_id text;
alter table public.vouchers add column if not exists purchased_at timestamptz default now();
alter table public.vouchers add column if not exists expires_at timestamptz;
alter table public.vouchers add column if not exists status text default 'active';
alter table public.vouchers add column if not exists redeemed_at timestamptz;
alter table public.vouchers add column if not exists created_at timestamptz default now();
alter table public.vouchers add column if not exists updated_at timestamptz default now();

create unique index if not exists vouchers_code_unique on public.vouchers(code);
create unique index if not exists vouchers_stripe_session_unique on public.vouchers(stripe_session_id);
create index if not exists vouchers_buyer_user_idx on public.vouchers(buyer_user_id);
create index if not exists vouchers_buyer_email_idx on public.vouchers(lower(buyer_email));
create index if not exists vouchers_recipient_email_idx on public.vouchers(lower(recipient_email));
alter table public.vouchers enable row level security;

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Member',
  title text,
  body text not null,
  category text not null default 'chat',
  image_url text,
  link_url text,
  price_eur numeric(10,2),
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.community_posts add column if not exists title text;
alter table public.community_posts add column if not exists category text not null default 'chat';
alter table public.community_posts add column if not exists image_url text;
alter table public.community_posts add column if not exists link_url text;
alter table public.community_posts add column if not exists price_eur numeric(10,2);
alter table public.community_posts add column if not exists location text;
alter table public.community_posts add column if not exists updated_at timestamptz not null default now();
alter table public.community_posts drop constraint if exists community_posts_body_check;
alter table public.community_posts add constraint community_posts_body_check check (char_length(body) between 1 and 1500);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Member',
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists community_posts_created_idx on public.community_posts(created_at desc);
create index if not exists community_posts_category_idx on public.community_posts(category);
create index if not exists community_comments_post_idx on public.community_comments(post_id, created_at);
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;

-- The website accesses these private tables through authenticated server endpoints.
-- The Supabase service-role key bypasses RLS; no public table policies are required.
