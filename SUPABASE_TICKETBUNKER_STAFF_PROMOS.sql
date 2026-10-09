-- Additive staff WhatsApp-sharing metadata and SoundBunker-only promo codes.
-- WhatsApp deep links deliver invitations; verified email + signed-in account grants access.
alter table public.sb_event_staff_invites add column if not exists invited_phone text;
alter table public.sb_event_staff_invites add column if not exists invited_name text;
alter table public.sb_event_staff_invites drop constraint if exists sb_staff_invite_phone_format;
alter table public.sb_event_staff_invites add constraint sb_staff_invite_phone_format check (
 invited_phone is null or invited_phone ~ '^\\+[1-9][0-9]{7,14}$'
);
create table if not exists public.sb_event_promos(
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.sb_events(id) on delete cascade,
 code text not null,
 discount_type text not null check (discount_type in ('percent','fixed')),
 discount_value integer not null check (discount_value between 1 and 1000000),
 max_uses integer not null default 100 check (max_uses between 1 and 100000),
 redeemed_count integer not null default 0 check (redeemed_count>=0),
 expires_at timestamptz,
 active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique(event_id,code),
 check((discount_type='percent' and discount_value<=90) or (discount_type='fixed'))
);
create index if not exists sb_event_promos_find_idx on public.sb_event_promos(event_id,code) where active;
alter table public.sb_event_promos enable row level security;
revoke all on table public.sb_event_promos from public,anon,authenticated;
grant all on table public.sb_event_promos to service_role;
-- Only SoundBunker-owned events can use these initial beta campaign codes.
create or replace function public.sb_validate_sb_promo_owner()
returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.sb_events where id=new.event_id and organiser_profile_id is null)
 then raise exception 'Promotional codes are restricted to SoundBunker-owned events'; end if;
 return new;
end $$;
drop trigger if exists sb_promo_sb_owner on public.sb_event_promos;
create trigger sb_promo_sb_owner before insert or update on public.sb_event_promos
for each row execute function public.sb_validate_sb_promo_owner();
