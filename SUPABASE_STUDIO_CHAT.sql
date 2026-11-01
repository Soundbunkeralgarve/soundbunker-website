-- Ask the Studio: website chat and WhatsApp conversations, and who is answering them.
-- Run once in the Supabase SQL editor. Only the server (secret key) reads or writes these tables.
create table if not exists public.studio_chat_threads (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('web', 'whatsapp')),
  external_id text not null,              -- WhatsApp number (wa_id) or the website chat session id
  client_name text,
  human_until timestamptz,                -- the assistant stays silent until this time (a team member is answering)
  handoff_at timestamptz,
  handoff_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_id)
);

create table if not exists public.studio_chat_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.studio_chat_threads(id) on delete cascade,
  role text not null check (role in ('client', 'assistant', 'team')),
  body text not null,
  external_message_id text unique,        -- WhatsApp message id, so retried webhooks are not answered twice
  created_at timestamptz not null default now()
);
create index if not exists studio_chat_messages_thread on public.studio_chat_messages (thread_id, created_at desc);

alter table public.studio_chat_threads enable row level security;
alter table public.studio_chat_messages enable row level security;
