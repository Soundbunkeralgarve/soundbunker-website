-- TicketBunker-scoped owner controls; no SoundBunker role changes.
create table public.tb_client_controls(
 organiser_id uuid primary key references public.sb_event_organisers(id),
 listing_discount_percent integer not null default 0 check(listing_discount_percent between 0 and 100),
 valid_until timestamptz,reason text not null default '',updated_by uuid references auth.users(id),updated_at timestamptz not null default now()
);
create table public.tb_admin_audit(
 id uuid primary key default gen_random_uuid(),actor uuid not null references auth.users(id),action text not null,target uuid,details jsonb not null default '{}',created_at timestamptz not null default now()
);
create table public.tb_email_campaigns(
 id uuid primary key,subject text not null,heading text not null,body text not null,image_url text not null default '',cta_label text not null,cta_url text not null,
 status text not null default 'draft' check(status in ('draft','preparing','ready','scheduling','scheduled','queued','sending','sent','cancelled','unknown')),
 revision integer not null default 1,broadcast_id uuid,scheduled_at timestamptz,last_error text,
 created_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),created_at timestamptz not null default now()
);
alter table public.tb_client_controls enable row level security;
alter table public.tb_admin_audit enable row level security;
alter table public.tb_email_campaigns enable row level security;
revoke all on public.tb_client_controls,public.tb_admin_audit,public.tb_email_campaigns from public,anon,authenticated;
grant all on public.tb_client_controls,public.tb_admin_audit,public.tb_email_campaigns to service_role;
create index tb_email_campaigns_created on public.tb_email_campaigns(created_at desc);
create index tb_admin_audit_created on public.tb_admin_audit(created_at desc);
create or replace function public.tb_update_client(p_actor uuid,p_id uuid,p_name text,p_status text,p_discount integer,p_until timestamptz,p_reason text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_org public.sb_event_organisers;old_control public.tb_client_controls;u record;
begin
 if coalesce(auth.role(),'')<>'service_role' and current_user<>'postgres' then raise exception 'Service access required';end if;
 select email into u from auth.users where id=p_actor and email_confirmed_at is not null;
 if not found or not exists(select 1 from public.tb_platform_admins where email=lower(u.email) and active) then raise exception 'Owner access required';end if;
 if length(trim(coalesce(p_name,''))) not between 2 and 160 or p_status is null or p_status not in ('pending_review','approved','suspended') or p_discount is null or p_discount not between 0 and 100 or length(trim(coalesce(p_reason,''))) not between 3 and 1000 or (p_until is not null and p_until<=now()) then raise exception 'Check client details, expiry and reason';end if;
 select * into old_org from public.sb_event_organisers where id=p_id for update;
 if not found then raise exception 'Organiser not found';end if;
 select * into old_control from public.tb_client_controls where organiser_id=p_id;
 update public.sb_event_organisers set display_name=trim(p_name),status=p_status,updated_at=now() where id=p_id;
 insert into public.tb_client_controls(organiser_id,listing_discount_percent,valid_until,reason,updated_by) values(p_id,p_discount,p_until,trim(p_reason),p_actor)
 on conflict(organiser_id) do update set listing_discount_percent=excluded.listing_discount_percent,valid_until=excluded.valid_until,reason=excluded.reason,updated_by=p_actor,updated_at=now();
 insert into public.tb_admin_audit(actor,action,target,details) values(p_actor,'update_client',p_id,jsonb_build_object('before',jsonb_build_object('display_name',old_org.display_name,'status',old_org.status,'listing_discount_percent',coalesce(old_control.listing_discount_percent,0)),'after',jsonb_build_object('display_name',trim(p_name),'status',p_status,'listing_discount_percent',p_discount,'valid_until',p_until),'reason',trim(p_reason)));
 return jsonb_build_object('saved',true);
end;$$;
revoke all on function public.tb_update_client(uuid,uuid,text,text,integer,timestamptz,text) from public,anon,authenticated;
grant execute on function public.tb_update_client(uuid,uuid,text,text,integer,timestamptz,text) to service_role;

create or replace function public.tb_reserve_events(p_id uuid,p_owner uuid,p_plan text,p_currency text,p_count integer,p_code text default '',p_notes text default '') returns jsonb language plpgsql security invoker set search_path='' as $$
declare u record;c public.tb_event_discount_codes;existing public.tb_event_prebookings;r public.tb_event_prebookings;unit integer;subtotal integer;discount integer;code_discount integer;used integer;account_discount integer:=0;
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
  insert into public.tb_event_prebookings(id,owner_user_id,contact_email,plan,currency,event_count,subtotal_cents,discount_cents,total_cents,rate_cents,included_tickets,notes) values(p_id,p_owner,u.email,p_plan,p_currency,1,39900,0,39900,15,2000,left(coalesce(p_notes,''),1500)) returning * into r;
  return to_jsonb(r);
 end if;
 unit:=case p_plan when 'starter' then 9900 when 'standard' then 19900 when 'headline' then 29900 when 'event_plus' then 39900 end;
 select coalesce(max(cc.listing_discount_percent),0) into account_discount from public.tb_client_controls cc join public.sb_event_organisers org on org.id=cc.organiser_id where org.owner_user_id=p_owner and org.status<>'suspended' and (cc.valid_until is null or cc.valid_until>now());
 subtotal:=unit*p_count;discount:=greatest(round(subtotal*case p_count when 4 then .05 when 8 then .10 else 0 end),round(subtotal*account_discount::numeric/100));
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

create or replace function public.sb_capacity_quote(p_actor uuid,p_event uuid,p_tier uuid,p_quantity integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e record;t record;total integer;band integer;target integer;prices integer[];
 names text[]:=array['starter','standard','headline','event_plus'];caps integer[]:=array[100,500,1000,2000];
 credit bigint:=0;upgrade_credit bigint:=0;charity boolean:=false;
begin
 select * into e from public.sb_events where id=p_event;
 if not found or not exists(select 1 from public.sb_event_organisers where id=e.organiser_profile_id and owner_user_id=p_actor) then raise exception 'Event access denied';end if;
 if e.status<>'published' or e.internal_free_test or e.public_beta_test or coalesce(e.ends_at,e.starts_at+interval '12 hours')<=now() then raise exception 'Capacity changes require an active published event';end if;
 select * into t from public.sb_event_tiers where id=p_tier and event_id=p_event;
 if not found or p_quantity is null or p_quantity<=t.quantity_total then raise exception 'Enter a larger ticket quantity';end if;
 select sum(quantity_total)::integer into total from public.sb_event_tiers where event_id=p_event;
 if total-t.quantity_total+p_quantity>2000 then raise exception 'Above 2,000 tickets, agree a setup-plus-sales plan before activation';end if;
 prices:=array[9900,19900,29900,39900];
 if e.currency not in ('eur','gbp') then raise exception 'Unsupported event currency';end if;
 select max(array_position(names,tier_code)),coalesce(sum(amount_cents),0) into band,credit from public.sb_event_listing_fees where event_id=p_event and status='paid' and currency=e.currency;
 select greatest(band,max(array_position(names,target_band))),coalesce(sum(amount_cents),0) into band,upgrade_credit from public.sb_capacity_changes where event_id=p_event and status='applied' and currency=e.currency;
 charity:=exists(select 1 from public.sb_event_charity_claims where event_id=p_event and status='verified') or exists(select 1 from public.tb_client_controls where organiser_id=e.organiser_profile_id and listing_discount_percent=100 and (valid_until is null or valid_until>now()));
 if charity then band:=greatest(band,4);credit:=greatest(credit,prices[4]);end if;
 credit:=credit+upgrade_credit;
 if band is null then raise exception 'A paid listing or verified charity exemption is required';end if;
 select min(i) into target from generate_subscripts(caps,1) i where caps[i]>=total-t.quantity_total+p_quantity;
 target:=greatest(band,target);
 return jsonb_build_object('oldTotal',total,'newTotal',total-t.quantity_total+p_quantity,'oldQuantity',t.quantity_total,'newQuantity',p_quantity,'currentBand',names[band],'targetBand',names[target],'paidCreditCents',credit,'targetAmountCents',prices[target],'amountCents',case when target=band then 0 else greatest(0,prices[target]-credit) end,'currency',e.currency,'vatIncluded',true);
end;$$;
revoke all on function public.sb_capacity_quote(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.sb_capacity_quote(uuid,uuid,uuid,integer) to service_role;
