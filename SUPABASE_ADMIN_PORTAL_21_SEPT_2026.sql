-- Run after the earlier portal, Dropbox and deliveries migrations.
-- These tables stay private: application endpoints authenticate every request
-- and use the service role. Do not add public RLS policies for them.
-- Existing portal installations can predate the Gold Card counter.
alter table public.profiles add column if not exists qualifying_booking_count integer not null default 0;
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_ref uuid unique,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text,
  customer_email text,
  service_id text,
  service_name text,
  local_date date,
  local_time text,
  start_at timestamptz,
  end_at timestamptz,
  status text default 'pending',
  deposit_eur numeric(10,2),
  total_eur numeric(10,2),
  paid_eur numeric(10,2),
  promo_code text,
  stripe_session_id text unique,
  google_event_id text,
  expires_at timestamptz,
  pending_start_at timestamptz,
  pending_end_at timestamptz,
  pending_date date,
  pending_time text,
  booking_details jsonb default '{}'::jsonb,
  version integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.bookings add column if not exists booking_ref uuid;
alter table public.bookings add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.bookings add column if not exists customer_name text;
alter table public.bookings add column if not exists customer_email text;
alter table public.bookings add column if not exists service_id text;
alter table public.bookings add column if not exists service_name text;
alter table public.bookings add column if not exists local_date date;
alter table public.bookings add column if not exists local_time text;
alter table public.bookings add column if not exists start_at timestamptz;
alter table public.bookings add column if not exists end_at timestamptz;
alter table public.bookings add column if not exists status text default 'pending';
alter table public.bookings add column if not exists deposit_eur numeric(10,2);
alter table public.bookings add column if not exists total_eur numeric(10,2);
alter table public.bookings add column if not exists paid_eur numeric(10,2);
alter table public.bookings add column if not exists promo_code text;
alter table public.bookings add column if not exists stripe_session_id text;
alter table public.bookings add column if not exists google_event_id text;
alter table public.bookings add column if not exists expires_at timestamptz;
alter table public.bookings add column if not exists pending_start_at timestamptz;
alter table public.bookings add column if not exists pending_end_at timestamptz;
alter table public.bookings add column if not exists pending_date date;
alter table public.bookings add column if not exists pending_time text;
alter table public.bookings add column if not exists booking_details jsonb default '{}'::jsonb;
alter table public.bookings add column if not exists version integer default 0;
alter table public.bookings add column if not exists updated_at timestamptz default now();
create unique index if not exists bookings_ref_unique on public.bookings(booking_ref) where booking_ref is not null;
create unique index if not exists bookings_stripe_unique on public.bookings(stripe_session_id) where stripe_session_id is not null;
create index if not exists bookings_email_idx on public.bookings(lower(customer_email));
create index if not exists bookings_user_idx on public.bookings(user_id, start_at desc);
alter table public.bookings enable row level security;

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('fixed','percent')),
  amount numeric(10,2) not null check (amount > 0),
  client_user_id uuid references auth.users(id) on delete set null,
  service_id text,
  max_uses integer check (max_uses is null or max_uses > 0),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.discount_claims (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  code_id uuid not null references public.discount_codes(id) on delete cascade,
  status text not null default 'reserved' check (status in ('reserved','used')),
  created_at timestamptz not null default now()
);
create index if not exists discount_claims_code_idx on public.discount_claims(code_id,status);
alter table public.discount_codes enable row level security;
alter table public.discount_claims enable row level security;

alter table public.vouchers add column if not exists remaining_eur numeric(10,2);
create table if not exists public.prize_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  service_id text not null check (service_id in ('prize-recording-1h','prize-photo-30m','photo-signature')),
  recipient_name text,
  recipient_email text,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.prize_codes drop constraint if exists prize_codes_service_id_check;
alter table public.prize_codes add constraint prize_codes_service_id_check
  check (service_id in ('prize-recording-1h','prize-photo-30m','photo-signature'));
create table if not exists public.voucher_claims (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  gift_id uuid references public.vouchers(id),
  prize_id uuid references public.prize_codes(id),
  applied_eur numeric(10,2) not null default 0,
  status text not null default 'reserved' check (status in ('reserved','used')),
  created_at timestamptz not null default now(),
  check ((gift_id is null) <> (prize_id is null))
);
create index if not exists voucher_claims_gift_idx on public.voucher_claims(gift_id,status);
create index if not exists voucher_claims_prize_idx on public.voucher_claims(prize_id,status);
alter table public.prize_codes enable row level security;
alter table public.voucher_claims enable row level security;

create table if not exists public.service_overrides (
  service_id text primary key,
  enabled boolean not null default true,
  price_eur numeric(10,2) not null check (price_eur >= 1),
  deposit_eur numeric(10,2) not null check (deposit_eur >= 1 and deposit_eur <= price_eur),
  updated_at timestamptz not null default now()
);
alter table public.service_overrides enable row level security;

create table if not exists public.portal_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  target_url text not null default '/client',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists portal_notifications_user_idx on public.portal_notifications(user_id,created_at desc);
alter table public.portal_notifications enable row level security;

create table if not exists public.booking_move_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  proposed_date date not null,
  proposed_time text not null,
  proposed_start_at timestamptz not null,
  proposed_end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  admin_note text,
  email_status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists booking_move_one_pending on public.booking_move_requests(booking_id) where status='pending';
create index if not exists booking_move_user_idx on public.booking_move_requests(user_id,created_at desc);
alter table public.booking_move_requests enable row level security;

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists direct_messages_sender_idx on public.direct_messages(sender_id,created_at desc);
create index if not exists direct_messages_recipient_idx on public.direct_messages(recipient_id,created_at desc);
alter table public.direct_messages enable row level security;

-- The site uses these functions only from authenticated server code with the
-- Supabase service role. Advisory lock serializes slot and coupon reservations.
create or replace function public.reserve_site_booking(p_data jsonb)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare b public.bookings; d public.discount_codes; claims_count integer;
  gift public.vouchers; prize public.prize_codes; credit numeric; held numeric;
begin
  perform pg_advisory_xact_lock(475166);
  update public.bookings set status='expired', updated_at=now()
    where status='pending' and expires_at < now();
  delete from public.discount_claims c using public.bookings x
    where c.booking_id=x.id and x.status='expired' and c.status='reserved';
  delete from public.voucher_claims c using public.bookings x
    where c.booking_id=x.id and x.status='expired' and c.status='reserved';
  if p_data->>'start_at' is not null and exists (
    select 1 from public.bookings x where x.status in ('pending','fulfilling','confirmed','rescheduling')
    and (x.start_at < (p_data->>'end_at')::timestamptz and x.end_at > (p_data->>'start_at')::timestamptz
      or x.pending_start_at < (p_data->>'end_at')::timestamptz and x.pending_end_at > (p_data->>'start_at')::timestamptz)
  ) then raise exception 'This time has just been booked'; end if;
  if nullif(p_data->>'promo_code','') is not null then
    select * into d from public.discount_codes where code=upper(p_data->>'promo_code') and active=true
      and (expires_at is null or expires_at>now())
      and (service_id is null or service_id=p_data->>'service_id')
      and (client_user_id is null or client_user_id=(p_data->>'user_id')::uuid);
    if not found then raise exception 'Discount code is unavailable for this booking'; end if;
    select count(*) into claims_count from public.discount_claims where code_id=d.id;
    if d.max_uses is not null and claims_count >= d.max_uses then raise exception 'Discount code has reached its limit'; end if;
  end if;
  if nullif(p_data->>'voucher_code','') is not null then
    if d.id is not null then raise exception 'A VIP discount cannot be combined with a voucher'; end if;
    select * into gift from public.vouchers where upper(code)=upper(p_data->>'voucher_code')
      and status='active' and (expires_at is null or expires_at>now());
    if gift.id is not null then
      select coalesce(sum(applied_eur),0) into held from public.voucher_claims
        where gift_id=gift.id and status='reserved';
      credit:=least((p_data->>'gross_total_eur')::numeric,greatest(0,coalesce(gift.remaining_eur,gift.amount_eur)-held));
      if credit<=0 then raise exception 'This voucher has no balance remaining'; end if;
    else
      select * into prize from public.prize_codes where code=upper(p_data->>'voucher_code')
        and active=true and (expires_at is null or expires_at>now())
        and service_id=p_data->>'service_id';
      if prize.id is null then raise exception 'Voucher code is unavailable for this service'; end if;
      if exists (select 1 from public.voucher_claims where prize_id=prize.id)
        then raise exception 'This prize code has already been used'; end if;
      credit:=(p_data->>'gross_total_eur')::numeric;
    end if;
    if credit is distinct from (p_data->>'voucher_credit')::numeric then
      raise exception 'Voucher value has changed. Refresh the quote'; end if;
    if (p_data->>'total_eur')::numeric <> (p_data->>'gross_total_eur')::numeric-credit then
      raise exception 'Invalid voucher total'; end if;
  end if;
  insert into public.bookings (booking_ref,user_id,customer_name,customer_email,service_id,service_name,
    local_date,local_time,start_at,end_at,status,deposit_eur,total_eur,promo_code,expires_at,booking_details)
  values ((p_data->>'booking_ref')::uuid,(p_data->>'user_id')::uuid,p_data->>'customer_name',
    lower(p_data->>'customer_email'),p_data->>'service_id',p_data->>'service_name',
    (p_data->>'local_date')::date,p_data->>'local_time',
    (p_data->>'start_at')::timestamptz,(p_data->>'end_at')::timestamptz,'pending',
    (p_data->>'deposit_eur')::numeric,(p_data->>'total_eur')::numeric,
    nullif(upper(p_data->>'promo_code'),''),now()+interval '31 minutes',
    coalesce(p_data->'booking_details','{}'::jsonb)) returning * into b;
  if d.id is not null then insert into public.discount_claims(booking_id,code_id) values(b.id,d.id); end if;
  if gift.id is not null or prize.id is not null then
    insert into public.voucher_claims(booking_id,gift_id,prize_id,applied_eur)
      values(b.id,gift.id,prize.id,credit);
  end if;
  return b;
end $$;

create or replace function public.apply_site_voucher(p_booking_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare claim public.voucher_claims; balance numeric;
begin
  perform pg_advisory_xact_lock(475166);
  select * into claim from public.voucher_claims where booking_id=p_booking_id for update;
  if not found or claim.status='used' then return; end if;
  if claim.gift_id is not null then
    update public.vouchers set remaining_eur=greatest(0,coalesce(remaining_eur,amount_eur)-claim.applied_eur),
      updated_at=now() where id=claim.gift_id returning remaining_eur into balance;
    if balance=0 then update public.vouchers set status='redeemed',redeemed_at=now() where id=claim.gift_id; end if;
  else
    update public.prize_codes set active=false where id=claim.prize_id;
  end if;
  update public.voucher_claims set status='used' where booking_id=p_booking_id;
end $$;

create or replace function public.finalize_site_booking(p_id uuid,p_stripe text,p_calendar text,
  p_paid numeric,p_user uuid)
returns public.bookings language plpgsql security definer set search_path=public as $$
declare b public.bookings;
begin
  perform pg_advisory_xact_lock(475166);
  select * into b from public.bookings where id=p_id for update;
  if not found then raise exception 'Booking missing'; end if;
  if b.status='confirmed' then return b; end if;
  if b.status not in ('pending','fulfilling') then raise exception 'Booking no longer available'; end if;
  if p_stripe is null and (p_paid<>0 or not exists(select 1 from public.voucher_claims where booking_id=p_id))
    then raise exception 'A paid booking cannot be confirmed without Stripe'; end if;
  if b.start_at is not null and p_calendar is null then raise exception 'Calendar event is required'; end if;
  perform public.apply_site_voucher(p_id);
  update public.discount_claims set status='used' where booking_id=p_id;
  update public.bookings set status='confirmed',stripe_session_id=coalesce(p_stripe,stripe_session_id),
    google_event_id=coalesce(p_calendar,google_event_id),paid_eur=p_paid,
    user_id=coalesce(user_id,p_user),updated_at=now() where id=p_id returning * into b;
  return b;
end $$;

create or replace function public.claim_site_booking_move(p_id uuid,p_user uuid,p_admin boolean,
  p_start timestamptz,p_end timestamptz,p_date date,p_time text)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  perform pg_advisory_xact_lock(475166);
  select * into b from public.bookings where id=p_id for update;
  if not found or (not p_admin and b.user_id is distinct from p_user) then raise exception 'Booking not found'; end if;
  if b.status<>'confirmed' then raise exception 'Only confirmed sessions can be moved'; end if;
  if b.start_at <= now()+interval '24 hours' then raise exception 'The 24-hour change window has closed; a new deposit is required'; end if;
  if p_start <= now() then raise exception 'Choose a future time'; end if;
  if p_date=b.local_date then raise exception 'Choose a different day'; end if;
  if exists (select 1 from public.bookings x where x.id<>p_id and x.status in ('pending','fulfilling','confirmed','rescheduling')
    and (x.start_at<p_end and x.end_at>p_start or x.pending_start_at<p_end and x.pending_end_at>p_start))
    then raise exception 'The new time has just been booked'; end if;
  update public.bookings set status='rescheduling', pending_start_at=p_start,pending_end_at=p_end,
    pending_date=p_date,pending_time=p_time,updated_at=now() where id=p_id returning * into b;
  return b;
end $$;

create or replace function public.finish_site_booking_move(p_id uuid,p_success boolean)
returns public.bookings language plpgsql security definer set search_path=public as $$
declare b public.bookings;
begin
  perform pg_advisory_xact_lock(475166);
  select * into b from public.bookings where id=p_id for update;
  if not found or b.status<>'rescheduling' then raise exception 'Move is no longer pending'; end if;
  update public.bookings set
    start_at=case when p_success then pending_start_at else start_at end,
    end_at=case when p_success then pending_end_at else end_at end,
    local_date=case when p_success then pending_date else local_date end,
    local_time=case when p_success then pending_time else local_time end,
    pending_start_at=null,pending_end_at=null,pending_date=null,pending_time=null,
    status='confirmed',version=version+1,updated_at=now() where id=p_id returning * into b;
  return b;
end $$;

revoke all on function public.reserve_site_booking(jsonb) from public, anon, authenticated;
revoke all on function public.claim_site_booking_move(uuid,uuid,boolean,timestamptz,timestamptz,date,text) from public, anon, authenticated;
revoke all on function public.finish_site_booking_move(uuid,boolean) from public, anon, authenticated;
grant execute on function public.reserve_site_booking(jsonb) to service_role;
grant execute on function public.claim_site_booking_move(uuid,uuid,boolean,timestamptz,timestamptz,date,text) to service_role;
grant execute on function public.finish_site_booking_move(uuid,boolean) to service_role;
revoke all on function public.apply_site_voucher(uuid) from public, anon, authenticated;
grant execute on function public.apply_site_voucher(uuid) to service_role;
revoke all on function public.finalize_site_booking(uuid,text,text,numeric,uuid) from public, anon, authenticated;
grant execute on function public.finalize_site_booking(uuid,text,text,numeric,uuid) to service_role;

-- Anonymous voucher code checks are limited per visitor. Existing short gift
-- codes remain usable, while automated guessing is slowed at the database.
create table if not exists public.voucher_code_attempts (
  actor_hash text not null,
  hour_start timestamptz not null,
  attempts integer not null default 1,
  primary key (actor_hash, hour_start)
);
create index if not exists voucher_code_attempts_hour_idx on public.voucher_code_attempts(hour_start);
alter table public.voucher_code_attempts enable row level security;
create or replace function public.allow_voucher_code_check(p_actor_hash text)
returns boolean language plpgsql security definer set search_path=public as $$
declare total integer;
begin
  insert into public.voucher_code_attempts(actor_hash,hour_start,attempts)
    values (p_actor_hash,date_trunc('hour',now()),1)
    on conflict (actor_hash,hour_start) do update
      set attempts=voucher_code_attempts.attempts+1
    returning attempts into total;
  delete from public.voucher_code_attempts where hour_start<now()-interval '1 day';
  return total<=60;
end $$;
revoke all on function public.allow_voucher_code_check(text) from public, anon, authenticated;
grant execute on function public.allow_voucher_code_check(text) to service_role;
grant select, insert, update, delete on public.voucher_code_attempts to service_role;
