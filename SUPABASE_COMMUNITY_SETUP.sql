-- Run once in Supabase SQL Editor to enable the private community.
create table if not exists public.community_posts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null default 'Member',
 body text not null check (char_length(body) between 1 and 1000),
 created_at timestamptz not null default now()
);
alter table public.community_posts enable row level security;
-- Website access is through authenticated server endpoints; service-role bypasses RLS.
