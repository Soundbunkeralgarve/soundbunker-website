begin;

create table if not exists public.plugin_affiliates (
  user_id uuid primary key,
  code text not null unique check (code ~ '^[a-f0-9]{24}$'),
  email text not null,
  full_name text not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

create table if not exists public.plugin_affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.plugin_affiliates(user_id),
  requested_at timestamptz not null default now(),
  notified_at timestamptz,
  bank_ciphertext text,
  cancelled_at timestamptz,
  paid_at timestamptz,
  paid_cents integer check (paid_cents > 0)
);
create index if not exists plugin_affiliate_payouts_owner on public.plugin_affiliate_payouts (affiliate_id, requested_at desc);

create table if not exists public.plugin_affiliate_sales (
  payment_intent text primary key,
  stripe_session_id text unique,
  affiliate_id uuid not null references public.plugin_affiliates(user_id),
  payout_id uuid references public.plugin_affiliate_payouts(id),
  commission_cents integer not null default 1000 check (commission_cents = 1000),
  created_at timestamptz not null default now(),
  reversed_at timestamptz
);
create index if not exists plugin_affiliate_sales_owner on public.plugin_affiliate_sales (affiliate_id);
create index if not exists plugin_affiliate_sales_payout on public.plugin_affiliate_sales (payout_id) where payout_id is not null;

alter table public.plugin_affiliates enable row level security;
alter table public.plugin_affiliate_sales enable row level security;
alter table public.plugin_affiliate_payouts enable row level security;
revoke all on public.plugin_affiliates, public.plugin_affiliate_sales, public.plugin_affiliate_payouts from public, anon, authenticated;
grant select, insert, update on public.plugin_affiliates, public.plugin_affiliate_sales, public.plugin_affiliate_payouts to service_role;

-- Reuse licences already delivered to the same email in the giveaway, including earlier Stripe guest checkouts.
create or replace function public.sb_plugin_claim_giveaway(p_user_id uuid, p_email text, p_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  promo public.plugin_codes;
  existing public.plugin_licences;
  result jsonb;
  address text := lower(btrim(p_email));
begin
  select * into promo from public.plugin_codes where code = 'SBPRODUCER' for update;
  if not found or not promo.active or promo.product_id <> 'complete' then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select l.* into existing from public.plugin_licences l
    where l.product_id = promo.product_id and lower(l.email) = address
      and (l.note = 'Code SBPRODUCER' or (l.source = 'stripe' and l.amount_cents = 0))
    order by (l.status = 'active') desc, l.created_at limit 1;
  if found then
    if existing.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'inactive'); end if;
    update public.plugin_licences set user_id = p_user_id where id = existing.id and user_id is null;
    return jsonb_build_object('ok', true, 'id', existing.id, 'new', false);
  end if;

  if not exists (select 1 from public.plugin_products where id = promo.product_id and active) then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  result := public.sb_plugin_redeem_code(promo.code, address, p_key);
  if (result->>'ok')::boolean then
    update public.plugin_licences set user_id = p_user_id, amount_cents = 0 where id = (result->>'id')::uuid;
  end if;
  return result;
end $$;

-- One row per Stripe payment. An earlier refund/dispute can leave a reversal before checkout fulfilment arrives.
create or replace function public.sb_plugin_affiliate_record(p_payment text, p_session text, p_affiliate uuid, p_email text, p_buyer uuid)
returns void language sql security invoker set search_path = '' as $$
  insert into public.plugin_affiliate_sales (payment_intent, stripe_session_id, affiliate_id)
  select p_payment, p_session, a.user_id from public.plugin_affiliates a
  where a.user_id = p_affiliate and lower(a.email) <> lower(btrim(p_email)) and a.user_id is distinct from p_buyer
  on conflict (payment_intent) do update set stripe_session_id = excluded.stripe_session_id
    where plugin_affiliate_sales.stripe_session_id is null;
$$;

create or replace function public.sb_plugin_affiliate_reverse(p_payment text, p_affiliate uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.plugin_affiliate_sales set reversed_at = now() where payment_intent = p_payment and reversed_at is null;
  if found or p_affiliate is null then return; end if;
  insert into public.plugin_affiliate_sales (payment_intent, affiliate_id, reversed_at)
    select p_payment, user_id, now() from public.plugin_affiliates where user_id = p_affiliate
  on conflict (payment_intent) do update set reversed_at = excluded.reversed_at
    where plugin_affiliate_sales.reversed_at is null;
end $$;

create or replace function public.sb_plugin_affiliate_request(p_affiliate uuid, p_payout uuid, p_bank text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  payout uuid;
begin
  perform 1 from public.plugin_affiliates where user_id = p_affiliate for update;
  if not found then return null; end if;
  select id into payout from public.plugin_affiliate_payouts
    where affiliate_id = p_affiliate and paid_at is null and cancelled_at is null order by requested_at limit 1 for update;
  if found then
    if exists (select 1 from public.plugin_affiliate_sales where payout_id = payout and reversed_at is null) then return payout; end if;
    update public.plugin_affiliate_payouts set cancelled_at = now(), bank_ciphertext = null where id = payout;
  end if;
  if not exists (select 1 from public.plugin_affiliate_sales where affiliate_id = p_affiliate
                 and stripe_session_id is not null and reversed_at is null and payout_id is null) then return null; end if;
  insert into public.plugin_affiliate_payouts (id, affiliate_id, bank_ciphertext) values (p_payout, p_affiliate, p_bank) returning id into payout;
  update public.plugin_affiliate_sales set payout_id = payout
    where affiliate_id = p_affiliate and stripe_session_id is not null and reversed_at is null and payout_id is null;
  return payout;
end $$;

create or replace function public.sb_plugin_affiliate_paid(p_payout uuid, p_expected_cents integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  total integer;
begin
  perform 1 from public.plugin_affiliate_payouts where id = p_payout and paid_at is null and cancelled_at is null for update;
  if not found then return null; end if;
  perform 1 from public.plugin_affiliate_sales where payout_id = p_payout for update;
  select coalesce(sum(commission_cents), 0) into total from public.plugin_affiliate_sales
    where payout_id = p_payout and reversed_at is null;
  if total <> p_expected_cents or total = 0 then return null; end if;
  update public.plugin_affiliate_payouts set paid_at = now(), paid_cents = total, bank_ciphertext = null where id = p_payout;
  return total;
end $$;

create or replace function public.sb_plugin_affiliate_summary(p_affiliate uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'sales', count(*) filter (where s.reversed_at is null),
    'available_cents', coalesce(sum(s.commission_cents) filter (where s.payout_id is null and s.reversed_at is null), 0),
    'requested_cents', coalesce(sum(s.commission_cents) filter (where s.payout_id is not null and p.paid_at is null and p.cancelled_at is null and s.reversed_at is null), 0),
    'paid_cents', (select coalesce(sum(paid_cents), 0) from public.plugin_affiliate_payouts where affiliate_id = p_affiliate),
    'open_request', (select id from public.plugin_affiliate_payouts where affiliate_id = p_affiliate and paid_at is null and cancelled_at is null order by requested_at limit 1),
    'payout_notice_pending', exists (select 1 from public.plugin_affiliate_payouts
      where affiliate_id = p_affiliate and paid_at is null and cancelled_at is null and notified_at is null)
  )
  from public.plugin_affiliate_sales s left join public.plugin_affiliate_payouts p on p.id = s.payout_id
  where s.affiliate_id = p_affiliate and s.stripe_session_id is not null;
$$;

revoke all on function public.sb_plugin_claim_giveaway(uuid, text, text),
  public.sb_plugin_affiliate_record(text, text, uuid, text, uuid), public.sb_plugin_affiliate_reverse(text, uuid),
  public.sb_plugin_affiliate_request(uuid, uuid, text), public.sb_plugin_affiliate_paid(uuid, integer), public.sb_plugin_affiliate_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.sb_plugin_claim_giveaway(uuid, text, text),
  public.sb_plugin_affiliate_record(text, text, uuid, text, uuid), public.sb_plugin_affiliate_reverse(text, uuid),
  public.sb_plugin_affiliate_request(uuid, uuid, text), public.sb_plugin_affiliate_paid(uuid, integer), public.sb_plugin_affiliate_summary(uuid)
  to service_role;

commit;
