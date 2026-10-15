-- Verified customer opt-in and event targeting. No imported or inferred consent.
create table public.tb_promo_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 opted_in boolean not null default false,
 country text not null check(country in ('PT','GB')),
 regions text[] not null default '{}', genres text[] not null default '{}',
 consent_at timestamptz, consent_version text not null default 'weekly-picks-v1',
 updated_at timestamptz not null default now(),
 check(not opted_in or (consent_at is not null and cardinality(genres)>0))
);
create table public.tb_event_targeting (
 event_id uuid primary key references public.sb_events(id) on delete cascade,
 country text not null check(country in ('PT','GB')),
 region text not null, genres text[] not null check(cardinality(genres)>0),
 updated_at timestamptz not null default now()
);
-- Campaign IDs are persisted BEFORE dispatch, so uncertain sends reconcile with Resend.
create table public.tb_weekly_campaigns (
 id uuid primary key default gen_random_uuid(),
 week_start date not null, group_key text not null,
 event_ids uuid[] not null, recipient_user_ids uuid[] not null,
 segment_id text, broadcast_id text unique,
 status text not null default 'preparing' check(status in ('preparing','ready','sending','sent','skipped','failed')),
 created_at timestamptz not null default now(), sent_at timestamptz, last_error text,
 unique(week_start,group_key),
 check(status<>'sent' or (broadcast_id is not null and sent_at is not null))
);
create table public.tb_weekly_recipients (
 week_start date not null, user_id uuid not null references auth.users(id) on delete cascade,
 campaign_id uuid not null references public.tb_weekly_campaigns(id),
 primary key(week_start,user_id)
);
alter table public.tb_promo_preferences enable row level security;
alter table public.tb_event_targeting enable row level security;
alter table public.tb_weekly_campaigns enable row level security;
alter table public.tb_weekly_recipients enable row level security;
revoke all on public.tb_promo_preferences,public.tb_event_targeting,public.tb_weekly_campaigns,public.tb_weekly_recipients from public,anon,authenticated;
grant all on public.tb_promo_preferences,public.tb_event_targeting,public.tb_weekly_campaigns,public.tb_weekly_recipients to service_role;
create index tb_promo_opted_in on public.tb_promo_preferences(user_id) where opted_in;
-- Admin/service query only: AND-match location and declared interests; live stock only.
create function public.tb_weekly_matches() returns table(user_id uuid,email text,event_id uuid,featured boolean)
language sql stable security invoker set search_path='' as $$
 select p.user_id,u.email,e.id,
 exists(select 1 from public.sb_event_showcase_requests s where s.event_id=e.id and s.status in ('paid','scheduled','live') and s.paid_at is not null and s.stripe_session_id is not null)
 from public.tb_promo_preferences p
 join auth.users u on u.id=p.user_id and u.email_confirmed_at is not null
 join public.tb_event_targeting t on t.country=p.country and (cardinality(p.regions)=0 or t.region=any(p.regions)) and t.genres && p.genres
 join public.sb_events e on e.id=t.event_id and e.country_code=t.country
 where p.opted_in and u.deleted_at is null
 and e.status='published' and not e.internal_free_test and not e.public_beta_test
 and e.starts_at>now() and e.starts_at<now()+interval '90 days'
 and exists(select 1 from public.sb_event_tiers tier left join public.sb_event_inventory() inv on inv.tier_id=tier.id where tier.event_id=e.id and tier.quantity_total>coalesce(inv.used_count,0));
$$;
revoke all on function public.tb_weekly_matches() from public,anon,authenticated;
grant execute on function public.tb_weekly_matches() to service_role;
-- One recipient reservation per Lisbon calendar week, even if a run retries.
create function public.tb_prepare_weekly_campaigns() returns integer
language plpgsql security invoker set search_path='' as $$
declare w date := date_trunc('week',now() at time zone 'Europe/Lisbon')::date; n integer;
begin
 perform pg_advisory_xact_lock(hashtext('ticketbunker-weekly-picks'));
 with ranked as (
  select m.*,row_number() over(partition by m.user_id order by m.featured desc,e.starts_at,e.id) as rank
  from public.tb_weekly_matches() m join public.sb_events e on e.id=m.event_id
  where not exists(select 1 from public.tb_weekly_recipients r where r.week_start=w and r.user_id=m.user_id)
 ), picks as (
  select user_id,array_agg(event_id order by rank) as ids from ranked where rank<=6 group by user_id
 ), groups as (
  select ids,md5(array_to_string(ids,',')) as group_key,array_agg(user_id order by user_id) as users from picks group by ids
 ), campaigns as (
  insert into public.tb_weekly_campaigns(week_start,group_key,event_ids,recipient_user_ids)
  select w,g.group_key,g.ids,g.users from groups g on conflict(week_start,group_key) do nothing
  returning *
 ) insert into public.tb_weekly_recipients(week_start,user_id,campaign_id)
 select c.week_start,u,c.id from campaigns c cross join unnest(c.recipient_user_ids) u
 on conflict do nothing;
 get diagnostics n = row_count;return n;
end $$;
revoke all on function public.tb_prepare_weekly_campaigns() from public,anon,authenticated;
grant execute on function public.tb_prepare_weekly_campaigns() to service_role;
