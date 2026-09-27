-- Run in Supabase SQL Editor for admin assignment of client music and photo deliveries.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  delivery_url text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.photo_galleries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  delivery_url text not null,
  created_at timestamptz not null default now()
);
alter table public.projects add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.projects add column if not exists title text;
alter table public.projects add column if not exists delivery_url text;
alter table public.projects add column if not exists created_at timestamptz default now();
alter table public.photo_galleries add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.photo_galleries add column if not exists title text;
alter table public.photo_galleries add column if not exists delivery_url text;
alter table public.photo_galleries add column if not exists created_at timestamptz default now();
create index if not exists projects_user_created_idx on public.projects(user_id,created_at desc);
create index if not exists galleries_user_created_idx on public.photo_galleries(user_id,created_at desc);
alter table public.projects enable row level security;
alter table public.photo_galleries enable row level security;
