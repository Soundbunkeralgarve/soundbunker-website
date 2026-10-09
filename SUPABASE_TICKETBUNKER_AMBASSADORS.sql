-- TicketBunker beta: organiser-controlled event ambassadors.
-- No checkout or automated complimentary-ticket issuance in beta.
create table if not exists public.sb_event_promo_teams (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.sb_events(id) on delete cascade,
 code text not null check (code ~ '^[A-Z0-9-]{4,24}$'),
 promoter_name text not null check (char_length(promoter_name) between 2 and 100),
 promoter_email text not null check (promoter_email=lower(promoter_email)),
 promoter_user_id uuid references auth.users(id),
 points_per_paid_ticket integer not null default 1 check (points_per_paid_ticket between 1 and 100),
 points_per_free_ticket integer not null default 25 check (points_per_free_ticket between 1 and 100000),
 reward_tier_id uuid references public.sb_event_tiers(id),
 status text not null default 'invited' check(status in ('invited','active','paused','revoked')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(event_id,code)
);
create index if not exists sb_event_promo_teams_event_idx on public.sb_event_promo_teams(event_id,status);
create index if not exists sb_event_promo_teams_email_idx on public.sb_event_promo_teams(promoter_email);
alter table public.sb_event_promo_teams enable row level security;
revoke all on public.sb_event_promo_teams from public,anon,authenticated;
grant all on public.sb_event_promo_teams to service_role;
create table if not exists public.sb_event_promo_attributions (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.sb_event_promo_teams(id),
 order_id uuid not null unique references public.sb_event_orders(id),
 verified_quantity integer not null check(verified_quantity between 1 and 8),
 points integer not null check(points between 1 and 800),
 status text not null default 'verified' check(status in ('verified','reversed')),
 created_at timestamptz not null default now(),
 reversed_at timestamptz
);
create index if not exists sb_event_promo_attributions_team_idx on public.sb_event_promo_attributions(team_id,status);
alter table public.sb_event_promo_attributions enable row level security;
revoke all on public.sb_event_promo_attributions from public,anon,authenticated;
grant all on public.sb_event_promo_attributions to service_role;
create table if not exists public.sb_event_promo_rewards (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.sb_event_promo_teams(id),
 points_spent integer not null check(points_spent>0),
 status text not null default 'requested' check(status in ('requested','approved','rejected','fulfilled','cancelled')),
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 issued_ticket_id uuid references public.sb_event_tickets(id),
 created_at timestamptz not null default now()
);
create index if not exists sb_event_promo_rewards_team_idx on public.sb_event_promo_rewards(team_id,status);
alter table public.sb_event_promo_rewards enable row level security;
revoke all on public.sb_event_promo_rewards from public,anon,authenticated;
grant all on public.sb_event_promo_rewards to service_role;
-- Paid order attribution and refund reversals intentionally NOT active in beta.
