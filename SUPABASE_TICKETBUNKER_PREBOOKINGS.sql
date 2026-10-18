-- TicketBunker-only administration and no-charge event reservations.
-- Stored advertised amounts include applicable VAT; billing tax treatment is reviewed before activation.
create table if not exists public.tb_platform_admins(email text primary key check(email=lower(email)),active boolean not null default true,created_at timestamptz not null default now());
alter table public.tb_platform_admins enable row level security;
revoke all on public.tb_platform_admins from anon,authenticated;
grant select,insert,update on public.tb_platform_admins to service_role;
insert into public.tb_platform_admins(email) values('bookings@theticketbunker.com'),('steve@soundbunker.pt') on conflict(email) do nothing;
create table if not exists public.tb_event_discount_codes(
 id uuid primary key default gen_random_uuid(),code text not null unique check(code=upper(code) and code ~ '^[A-Z0-9_-]{3,32}$'),
 kind text not null check(kind in ('percent','fixed')),value integer not null check(value>0),currency text check(currency in ('eur','gbp')),
 max_uses integer not null check(max_uses between 1 and 10000),expires_at timestamptz not null,active boolean not null default true,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 check((kind='percent' and value<=100 and currency is null) or (kind='fixed' and value<=1000000 and currency is not null))
);
alter table public.tb_event_discount_codes enable row level security;
revoke all on public.tb_event_discount_codes from anon,authenticated;
grant all on public.tb_event_discount_codes to service_role;
create table if not exists public.tb_event_prebookings(
 id uuid primary key,owner_user_id uuid not null references auth.users(id),contact_email text not null,
 plan text not null check(plan in ('starter','standard','headline','event_plus','usage')),currency text not null check(currency in ('eur','gbp')),
 event_count integer not null check(event_count in (1,4,8)),subtotal_cents integer not null check(subtotal_cents>=0),discount_cents integer not null check(discount_cents>=0),total_cents integer not null check(total_cents>=0),
 rate_cents integer,discount_code_id uuid references public.tb_event_discount_codes(id),status text not null default 'requested' check(status in ('requested','approved','cancelled')),
 notes text not null default '',created_at timestamptz not null default now(),quote_valid_until timestamptz not null default now()+interval '30 days',
 reviewed_at timestamptz,reviewed_by uuid references auth.users(id),check(total_cents=subtotal_cents-discount_cents),
 check((plan='usage' and event_count=1 and rate_cents>0 and subtotal_cents>0 and discount_cents=0 and discount_code_id is null) or (plan<>'usage' and rate_cents is null))
);
create index if not exists tb_prebooking_owner on public.tb_event_prebookings(owner_user_id,created_at desc);
create index if not exists tb_prebooking_code on public.tb_event_prebookings(discount_code_id,status);
alter table public.tb_event_prebookings enable row level security;
revoke all on public.tb_event_prebookings from anon,authenticated;
grant select on public.tb_event_prebookings to authenticated;
grant all on public.tb_event_prebookings to service_role;
create policy tb_prebooking_owner_read on public.tb_event_prebookings for select to authenticated using((select auth.uid())=owner_user_id);
create or replace function public.tb_reserve_events(p_id uuid,p_owner uuid,p_plan text,p_currency text,p_count integer,p_code text default '',p_notes text default '') returns jsonb language plpgsql security invoker set search_path='' as $$
declare u record;c public.tb_event_discount_codes;existing public.tb_event_prebookings;r public.tb_event_prebookings;unit integer;subtotal integer;discount integer;code_discount integer;used integer;
begin
 if coalesce(auth.role(),'')<>'service_role' and current_user<>'postgres' then raise exception 'Service access required';end if;
 if p_id is null or p_owner is null then raise exception 'Invalid request reference';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,1));
 select * into existing from public.tb_event_prebookings where id=p_id;
 if found then if existing.owner_user_id<>p_owner then raise exception 'Invalid request reference';end if;return to_jsonb(existing);end if;
 select id,email into u from auth.users where id=p_owner and email_confirmed_at is not null;if not found then raise exception 'Verify your email before reserving';end if;
 if p_currency is null or p_count is null or p_plan is null or p_currency not in ('eur','gbp') or p_count not in (1,4,8) or p_plan not in ('starter','standard','headline','event_plus','usage') then raise exception 'Choose a valid plan';end if;
 if (select count(*) from public.tb_event_prebookings where owner_user_id=p_owner and status='requested' and quote_valid_until>now())>=10 then raise exception 'You already have ten open reservations';end if;
 if p_plan='usage' then
  if p_count<>1 or trim(coalesce(p_code,''))<>'' then raise exception 'Usage pricing is quoted separately; codes and bundles do not apply';end if;
  insert into public.tb_event_prebookings(id,owner_user_id,contact_email,plan,currency,event_count,subtotal_cents,discount_cents,total_cents,rate_cents,notes) values(p_id,p_owner,u.email,p_plan,p_currency,1,9900,0,9900,15,left(coalesce(p_notes,''),1500)) returning * into r;
  return to_jsonb(r);
 end if;
 unit:=case p_plan when 'starter' then 9900 when 'standard' then 19900 when 'headline' then 29900 when 'event_plus' then 39900 end;
 subtotal:=unit*p_count;discount:=round(subtotal*case p_count when 4 then .05 when 8 then .10 else 0 end);
 if trim(coalesce(p_code,''))<>'' then
  select * into c from public.tb_event_discount_codes where code=upper(trim(p_code)) for update;
  if not found or not c.active or c.expires_at<=now() or (c.currency is not null and c.currency<>p_currency) then raise exception 'Discount code is unavailable';end if;
  select count(*) into used from public.tb_event_prebookings where discount_code_id=c.id and (status='approved' or (status='requested' and quote_valid_until>now()));
  if used>=c.max_uses or exists(select 1 from public.tb_event_prebookings where discount_code_id=c.id and owner_user_id=p_owner and (status='approved' or (status='requested' and quote_valid_until>now()))) then raise exception 'Discount code usage limit reached';end if;
  code_discount:=case when c.kind='percent' then round(subtotal*c.value::numeric/100) else least(subtotal,c.value) end;
  if code_discount>discount then discount:=code_discount;else c.id:=null;end if;
 end if;
 insert into public.tb_event_prebookings(id,owner_user_id,contact_email,plan,currency,event_count,subtotal_cents,discount_cents,total_cents,discount_code_id,notes) values(p_id,p_owner,u.email,p_plan,p_currency,p_count,subtotal,discount,subtotal-discount,c.id,left(coalesce(p_notes,''),1500)) returning * into r;
 return to_jsonb(r);
end;$$;
revoke all on function public.tb_reserve_events(uuid,uuid,text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.tb_reserve_events(uuid,uuid,text,text,integer,text,text) to service_role;
