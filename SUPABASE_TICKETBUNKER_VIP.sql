-- TicketBunker VIP membership: one row per account. Stripe owns billing; this row mirrors
-- the subscription so the site, door scanner and guest lists can see who is VIP.
-- 'interested' rows are people who asked to hear when VIP opens (no payment taken).
create table if not exists public.tb_vip_members(
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null check(email=lower(email)),
 status text not null default 'interested' check(status in ('interested','active','past_due','cancelled')),
 plan text check(plan in ('monthly','yearly')),
 currency text check(currency in ('eur','gbp')),
 stripe_customer_id text check(stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
 stripe_subscription_id text unique check(stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
 current_period_end timestamptz,
 cancel_at_period_end boolean not null default false,
 member_since timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(status='interested' or (plan is not null and currency is not null and stripe_subscription_id is not null))
);
create index if not exists tb_vip_members_status on public.tb_vip_members(status);
alter table public.tb_vip_members enable row level security;
revoke all on public.tb_vip_members from anon,authenticated;
grant select on public.tb_vip_members to authenticated;
grant all on public.tb_vip_members to service_role;
drop policy if exists tb_vip_member_read on public.tb_vip_members;
create policy tb_vip_member_read on public.tb_vip_members for select to authenticated using((select auth.uid())=user_id);

-- True while a member's paid period is running (cancelled members keep VIP until it ends).
create or replace function public.tb_is_vip(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tb_vip_members m where m.user_id=p_user and m.status in ('active','past_due','cancelled')
  and m.current_period_end is not null and m.current_period_end>now());
$$;
revoke all on function public.tb_is_vip(uuid) from public,anon,authenticated;
grant execute on function public.tb_is_vip(uuid) to service_role;
