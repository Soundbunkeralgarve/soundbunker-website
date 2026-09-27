-- Run once in the existing Supabase project's SQL Editor.
create table if not exists public.shop_orders (
 id uuid primary key,
 access_token text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null,
 recipient jsonb not null,
 items jsonb not null,
 subtotal_cents integer not null check (subtotal_cents > 0),
 shipping_cents integer not null check (shipping_cents >= 0),
 total_cents integer not null check (total_cents = subtotal_cents + shipping_cents),
 shipping_method text not null,
 shipping_label text,
 stripe_session_id text unique,
 printful_order_id bigint unique,
 status text not null default 'quoted',
 last_error text,
 customer_email_sent boolean not null default false,
 studio_email_sent boolean not null default false,
 lock_id uuid,
 lock_until timestamptz
);
alter table public.shop_orders enable row level security;
revoke all on public.shop_orders from anon, authenticated;
grant all on public.shop_orders to service_role;
create or replace function public.claim_shop_order(p_id uuid, p_lock uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
 update public.shop_orders set lock_id=p_lock, lock_until=now()+interval '2 minutes'
 where id=p_id and (lock_until is null or lock_until < now());
 return found;
end;
$$;
revoke all on function public.claim_shop_order(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_shop_order(uuid,uuid) to service_role;
create index if not exists shop_orders_created_idx on public.shop_orders(created_at desc);
