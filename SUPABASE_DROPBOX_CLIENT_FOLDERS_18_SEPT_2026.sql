-- Run once in Supabase SQL Editor before enabling automatic Dropbox folders.
-- Safe to run again.

alter table public.profiles add column if not exists dropbox_folder_path text;
alter table public.profiles add column if not exists dropbox_shared_url text;
alter table public.profiles add column if not exists dropbox_created_at timestamptz;

create unique index if not exists profiles_dropbox_folder_unique
on public.profiles(dropbox_folder_path)
where dropbox_folder_path is not null;
