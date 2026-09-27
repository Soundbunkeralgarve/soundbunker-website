-- SoundBunker final client/community/voucher additions. Safe to run after the earlier community setup.
alter table public.profiles add column if not exists artist_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists creative_role text;
alter table public.profiles add column if not exists genres text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists social_link text;

alter table public.community_posts add column if not exists post_type text not null default 'General Chat';
alter table public.community_posts add column if not exists attachment_url text;
alter table public.community_posts add column if not exists attachment_name text;

alter table public.vouchers add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.vouchers add column if not exists stripe_session_id text;
alter table public.vouchers add column if not exists voucher_code text;
alter table public.vouchers add column if not exists service_id text;
alter table public.vouchers add column if not exists service_name text;
alter table public.vouchers add column if not exists gift_to text;
alter table public.vouchers add column if not exists gift_from text;
alter table public.vouchers add column if not exists recipient_email text;
alter table public.vouchers add column if not exists gift_message text;
alter table public.vouchers add column if not exists start_date date;
alter table public.vouchers add column if not exists amount numeric;
alter table public.vouchers add column if not exists status text not null default 'active';
alter table public.vouchers add column if not exists created_at timestamptz not null default now();
create unique index if not exists vouchers_voucher_code_unique on public.vouchers(voucher_code) where voucher_code is not null;
create unique index if not exists vouchers_stripe_session_unique on public.vouchers(stripe_session_id) where stripe_session_id is not null;

insert into storage.buckets (id,name,public) values ('community-files','community-files',true) on conflict (id) do nothing;
insert into storage.buckets (id,name,public) values ('avatars','avatars',true) on conflict (id) do nothing;

-- Storage: authenticated members may upload to their own top-level folder.
drop policy if exists "community files upload" on storage.objects;
create policy "community files upload" on storage.objects for insert to authenticated
with check (bucket_id='community-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "community files read" on storage.objects;
create policy "community files read" on storage.objects for select to authenticated using (bucket_id='community-files');
drop policy if exists "avatars upload" on storage.objects;
create policy "avatars upload" on storage.objects for insert to authenticated
with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "avatars update" on storage.objects;
create policy "avatars update" on storage.objects for update to authenticated
using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects for select using (bucket_id='avatars');
