-- SoundBunker Social profile, presence and live-chat upgrade.
-- Safe to run more than once in the Supabase SQL Editor.

alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists creative_roles text[] not null default '{}';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists gold_status boolean not null default false;

create index if not exists profiles_last_seen_idx on public.profiles(last_seen_at desc);

create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists community_messages_created_idx on public.community_messages(created_at desc);
alter table public.community_messages enable row level security;

-- Public avatar bucket. Members may only upload into their own user-ID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-avatars', 'community-avatars', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Members upload own social avatar" on storage.objects;
create policy "Members upload own social avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'community-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Members update own social avatar" on storage.objects;
create policy "Members update own social avatar"
on storage.objects for update to authenticated
using (bucket_id = 'community-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'community-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Public social avatars" on storage.objects;
create policy "Public social avatars"
on storage.objects for select to public
using (bucket_id = 'community-avatars');

-- Live messages are read and written through authenticated website endpoints.
-- The service-role key bypasses RLS; no public message-table policies are required.
