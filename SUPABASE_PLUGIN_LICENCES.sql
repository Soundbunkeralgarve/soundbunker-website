-- SoundBunker plug-in licences: products, licences, computer activations and trials.
-- Run once in the Supabase SQL editor (safe to run again). Only the website's service role can read or write these tables;
-- the plug-ins and the Client Area go through /api/licence. Prices start at 0 with active = false: set each price and
-- active = true (Table editor > plugin_products) before that product can be sold.

create table if not exists plugin_products (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  tagline text not null default '',
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'eur' check (currency = 'eur'),
  seats integer not null default 2 check (seats between 1 and 10),
  includes text[] not null,                      -- plug-in ids this purchase unlocks (a bundle lists several)
  version text not null default '1.0.0',
  mac_download text,
  windows_download text,
  sort integer not null default 100,
  active boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint plugin_products_sellable check (not active or price_cents > 0),
  constraint plugin_products_includes check (cardinality(includes) >= 1)
);

insert into plugin_products (id, name, tagline, includes, sort) values
  ('armoury',  'SoundBunker Armoury', '11 mix and master effects',                  array['armoury'], 10),
  ('nuclear',  'NUCLEAR',             'Wavetable synthesiser',                      array['nuclear'], 20),
  ('napalm',   'NAPALM',              'Virtual analogue synthesiser',               array['napalm'], 30),
  ('shrapnel', 'SHRAPNEL',            'Drum machine and sample instrument',         array['shrapnel'], 40),
  ('fallout',  'FALLOUT',             'Extreme saturation',                         array['fallout'], 50),
  ('sentinel', 'SENTINEL',            'Precision mastering console',                array['sentinel'], 60),
  ('recon',    'RECON',               'Sampler with iPhone and Android capture',    array['recon'], 70),
  ('complete', 'SoundBunker Complete', 'Every SoundBunker plug-in',
     array['armoury','nuclear','napalm','shrapnel','fallout','sentinel','recon'], 5)
on conflict (id) do nothing;

create table if not exists plugin_licences (
  id uuid primary key default gen_random_uuid(),
  licence_key text not null unique check (licence_key ~ '^SB(-[0-9A-HJKMNP-TV-Z]{5}){4}$'),
  product_id text not null references plugin_products(id),
  includes text[] not null,                      -- copied from the product at purchase time
  seats integer not null check (seats between 1 and 10),
  email text not null,
  user_id uuid,
  status text not null default 'active' check (status in ('active', 'revoked', 'refunded')),
  source text not null default 'stripe' check (source in ('stripe', 'stripe-test', 'admin')),
  stripe_session_id text unique,
  stripe_payment_intent text,
  amount_cents integer,
  note text not null default '',
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text
);
create index if not exists plugin_licences_email on plugin_licences (lower(email));
create index if not exists plugin_licences_payment on plugin_licences (stripe_payment_intent);

create table if not exists plugin_activations (
  id uuid primary key default gen_random_uuid(),
  licence_id uuid not null references plugin_licences(id) on delete cascade,
  product_id text not null,
  machine_id text not null check (machine_id ~ '^[0-9a-f]{64}$'),
  machine_name text not null default '',
  os text not null default '',
  plugin_version text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deactivated_at timestamptz
);
create unique index if not exists plugin_activations_live
  on plugin_activations (licence_id, product_id, machine_id) where deactivated_at is null;

create table if not exists plugin_trials (
  product_id text not null,
  machine_id text not null check (machine_id ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default now(),
  primary key (product_id, machine_id)
);

alter table plugin_products enable row level security;
alter table plugin_licences enable row level security;
alter table plugin_activations enable row level security;
alter table plugin_trials enable row level security;
revoke all on plugin_products, plugin_licences, plugin_activations, plugin_trials from anon, authenticated;

-- Activate one product on one computer. A computer counts once per licence, whichever of the licence's plug-ins it runs,
-- so a SoundBunker Complete licence on 2 computers covers every plug-in on both. Row lock keeps the seat count exact
-- when two computers activate at the same moment.
create or replace function sb_plugin_activate(p_key text, p_product text, p_machine text, p_name text, p_os text, p_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l plugin_licences;
  used integer;
begin
  select * into l from plugin_licences where licence_key = p_key for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_key'); end if;
  if l.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'revoked'); end if;
  if not (p_product = any (l.includes)) then return jsonb_build_object('ok', false, 'error', 'wrong_product'); end if;

  update plugin_activations set last_seen_at = now(), machine_name = left(p_name, 120), os = left(p_os, 120),
         plugin_version = left(p_version, 40)
   where licence_id = l.id and product_id = p_product and machine_id = p_machine and deactivated_at is null;
  if found then return jsonb_build_object('ok', true, 'id', l.id, 'email', l.email, 'key', l.licence_key); end if;

  select count(distinct machine_id) into used from plugin_activations
   where licence_id = l.id and deactivated_at is null and machine_id <> p_machine;
  if used >= l.seats and not exists (select 1 from plugin_activations where licence_id = l.id
                                      and machine_id = p_machine and deactivated_at is null) then
    return jsonb_build_object('ok', false, 'error', 'no_seats', 'seats', l.seats);
  end if;

  insert into plugin_activations (licence_id, product_id, machine_id, machine_name, os, plugin_version)
  values (l.id, p_product, p_machine, left(p_name, 120), left(p_os, 120), left(p_version, 40));
  return jsonb_build_object('ok', true, 'id', l.id, 'email', l.email, 'key', l.licence_key);
end $$;

-- Re-check an activation (the plug-in does this every 30 days). Unknown or deactivated: the plug-in forgets its licence.
create or replace function sb_plugin_refresh(p_licence uuid, p_product text, p_machine text, p_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l plugin_licences;
begin
  select * into l from plugin_licences where id = p_licence;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if l.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'revoked'); end if;
  update plugin_activations set last_seen_at = now(), plugin_version = left(p_version, 40)
   where licence_id = l.id and product_id = p_product and machine_id = p_machine and deactivated_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'id', l.id, 'email', l.email, 'key', l.licence_key);
end $$;

-- Free this computer's seat for one product (from the plug-in) or every product (p_product null: Client Area / admin).
create or replace function sb_plugin_deactivate(p_licence uuid, p_product text, p_machine text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update plugin_activations set deactivated_at = now()
   where licence_id = p_licence and machine_id = p_machine
     and (p_product is null or product_id = p_product) and deactivated_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'deactivated', n);
end $$;

-- One trial per product per computer. Asking again during the trial (a reinstall) returns the original start, so a trial
-- is never extended; asking after it ended is refused.
create or replace function sb_plugin_trial(p_product text, p_machine text, p_days integer default 14)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  started timestamptz;
begin
  if not exists (select 1 from plugin_products where p_product = any (includes)) then
    return jsonb_build_object('ok', false, 'error', 'wrong_product');
  end if;
  insert into plugin_trials (product_id, machine_id) values (p_product, p_machine) on conflict do nothing;
  select started_at into started from plugin_trials where product_id = p_product and machine_id = p_machine;
  if started + make_interval(days => p_days) <= now() then
    return jsonb_build_object('ok', false, 'error', 'trial_used');
  end if;
  return jsonb_build_object('ok', true, 'started', extract(epoch from started)::bigint);
end $$;

revoke all on function sb_plugin_activate(text, text, text, text, text, text), sb_plugin_refresh(uuid, text, text, text),
  sb_plugin_deactivate(uuid, text, text), sb_plugin_trial(text, text, integer) from public, anon, authenticated;
grant execute on function sb_plugin_activate(text, text, text, text, text, text), sb_plugin_refresh(uuid, text, text, text),
  sb_plugin_deactivate(uuid, text, text), sb_plugin_trial(text, text, integer) to service_role;
