-- Community 2.0 schema. Safe to run more than once.
-- The complete portal migration, including vouchers, is in
-- SUPABASE_PORTAL_UPGRADE_17_SEPT_2026.sql.

create table if not exists public.community_posts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null default 'Member',
 title text,
 body text not null check (char_length(body) between 1 and 1500),
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
 primary key (post_id,user_id)
);
create index if not exists community_posts_created_idx on public.community_posts(created_at desc);
create index if not exists community_posts_category_idx on public.community_posts(category);
create index if not exists community_comments_post_idx on public.community_comments(post_id,created_at);
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
