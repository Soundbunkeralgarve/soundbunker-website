-- Optional buyer discount on organiser promoter codes. Disabled at checkout during beta.
alter table public.sb_event_promo_teams
add column if not exists buyer_discount_percent integer not null default 0
check (buyer_discount_percent between 0 and 50);