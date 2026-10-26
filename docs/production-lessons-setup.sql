-- Run once before deploying the Live Sessions API. All table access is server-only.
begin;
create table if not exists public.production_lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  student_name text not null,
  created_by uuid not null references auth.users(id),
  title text not null check (char_length(title) between 1 and 160),
  starts_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  daw text not null default '', goal text not null default '', audio_url text not null default '',
  zoom_meeting_id text, zoom_password text, zoom_join_url text,
  provisioning boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists production_lessons_student_start on public.production_lessons(student_id, starts_at desc);
create table if not exists public.production_lesson_notes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.production_lessons(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  author_name text not null, is_tutor boolean not null default false,
  kind text not null check (kind in ('note','question','review','feedback','homework')),
  body text not null check (char_length(body) between 1 and 5000),
  track_name text not null default '', at_seconds integer check (at_seconds between 0 and 86400),
  created_at timestamptz not null default now()
);
create index if not exists production_lesson_notes_order on public.production_lesson_notes(lesson_id, created_at);
create table if not exists public.production_lesson_files (
  id uuid primary key,
  lesson_id uuid not null references public.production_lessons(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id), name text not null,
  path text not null unique, size bigint not null check (size between 1 and 52428800),
  kind text not null check (kind in ('music','resource')),
  status text not null default 'pending' check (status in ('pending','ready')),
  created_at timestamptz not null default now()
);
create index if not exists production_lesson_files_lesson on public.production_lesson_files(lesson_id, created_at desc);
alter table public.production_lessons enable row level security;
alter table public.production_lesson_notes enable row level security;
alter table public.production_lesson_files enable row level security;
revoke all on public.production_lessons, public.production_lesson_notes, public.production_lesson_files from anon, authenticated;
grant all on public.production_lessons, public.production_lesson_notes, public.production_lesson_files to service_role;
-- No public or authenticated table policies: the verified API enforces student ownership.
-- Inspect existing storage.objects policies before applying this bucket creation.
insert into storage.buckets (id, name, public, file_size_limit)
values ('soundbunker-lessons', 'soundbunker-lessons', false, 52428800)
on conflict (id) do nothing;
commit;
