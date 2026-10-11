-- Capacity changes are immutable quotes. Service-only RPCs enforce ownership and payment.
create table public.sb_capacity_changes (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.sb_events(id),tier_id uuid not null references public.sb_event_tiers(id),created_by uuid not null references auth.users(id),
 old_total integer not null,new_total integer not null,old_quantity integer not null,new_quantity integer not null,
 current_band text not null,target_band text not null,amount_cents integer not null check(amount_cents>=0),currency text not null,
 status text not null default 'pending' check(status in ('pending','applied','expired','needs_attention')),stripe_session_id text unique,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '35 minutes',applied_at timestamptz
);
create unique index sb_capacity_pending on public.sb_capacity_changes(event_id) where status='pending';
create index sb_capacity_changes_tier on public.sb_capacity_changes(tier_id);
create index sb_capacity_changes_actor on public.sb_capacity_changes(created_by);
create table public.sb_capacity_alerts (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.sb_events(id),capacity integer not null,threshold integer not null,used integer not null,created_at timestamptz not null default now(),unique(event_id,capacity,threshold)
);
alter table public.sb_capacity_changes enable row level security;
alter table public.sb_capacity_alerts enable row level security;
revoke all on public.sb_capacity_changes,public.sb_capacity_alerts from public,anon,authenticated;
grant all on public.sb_capacity_changes,public.sb_capacity_alerts to service_role;
create function public.sb_capacity_quote(p_actor uuid,p_event uuid,p_tier uuid,p_quantity integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e record;t record;total integer;band integer;target integer;prices integer[];names text[]:=array['starter','standard','event_plus'];
begin
 select * into e from public.sb_events where id=p_event;
 if not found or not exists(select 1 from public.sb_event_organisers where id=e.organiser_profile_id and owner_user_id=p_actor) then raise exception 'Event access denied';end if;
 if e.status<>'published' or e.internal_free_test or e.public_beta_test or coalesce(e.ends_at,e.starts_at+interval '12 hours')<=now() then raise exception 'Capacity changes require an active published event';end if;
 select * into t from public.sb_event_tiers where id=p_tier and event_id=p_event;
 if not found or p_quantity is null or p_quantity<=t.quantity_total then raise exception 'Enter a larger ticket quantity';end if;
 select sum(quantity_total)::integer into total from public.sb_event_tiers where event_id=p_event;
 if total-t.quantity_total+p_quantity>2000 then raise exception 'Maximum event capacity is 2,000';end if;
 select max(array_position(names,tier_code)) into band from public.sb_event_listing_fees where event_id=p_event and status='paid' and currency=e.currency;
 select greatest(band,max(array_position(names,target_band))) into band from public.sb_capacity_changes where event_id=p_event and status='applied' and currency=e.currency;
 if exists(select 1 from public.sb_event_charity_claims where event_id=p_event and status='verified') then band:=3;end if;
 if band is null then raise exception 'A paid listing or verified charity exemption is required';end if;
 target:=greatest(band,case when total-t.quantity_total+p_quantity<=100 then 1 when total-t.quantity_total+p_quantity<=500 then 2 else 3 end);
 prices:=case e.currency when 'eur' then array[5900,11900,23900] when 'gbp' then array[4900,9900,19900] end;
 if prices is null then raise exception 'Unsupported event currency';end if;
 return jsonb_build_object('oldTotal',total,'newTotal',total-t.quantity_total+p_quantity,'oldQuantity',t.quantity_total,'newQuantity',p_quantity,'currentBand',names[band],'targetBand',names[target],'amountCents',prices[target]-prices[band],'currency',e.currency);
end $$;
create function public.sb_prepare_capacity_change(p_actor uuid,p_event uuid,p_tier uuid,p_quantity integer,p_expected_amount integer) returns public.sb_capacity_changes language plpgsql security invoker set search_path='' as $$
declare q jsonb;r public.sb_capacity_changes;
begin
 perform id from public.sb_events where id=p_event for update;
 perform id from public.sb_event_tiers where id=p_tier for update;
 q:=public.sb_capacity_quote(p_actor,p_event,p_tier,p_quantity);
 if p_expected_amount is distinct from (q->>'amountCents')::integer then raise exception 'Price changed. Review a new quote';end if;
 update public.sb_capacity_changes set status='expired' where event_id=p_event and status='pending' and expires_at<now();
 if exists(select 1 from public.sb_capacity_changes where event_id=p_event and status='pending') then raise exception 'An upgrade checkout is pending. Finish it or wait 35 minutes';end if;
 insert into public.sb_capacity_changes(event_id,tier_id,created_by,old_total,new_total,old_quantity,new_quantity,current_band,target_band,amount_cents,currency,status,applied_at)
 values(p_event,p_tier,p_actor,(q->>'oldTotal')::integer,(q->>'newTotal')::integer,(q->>'oldQuantity')::integer,p_quantity,q->>'currentBand',q->>'targetBand',p_expected_amount,q->>'currency',case when p_expected_amount=0 then 'applied' else 'pending' end,case when p_expected_amount=0 then now() end) returning * into r;
 if p_expected_amount=0 then update public.sb_event_tiers set quantity_total=p_quantity where id=p_tier;end if;
 return r;
end $$;
create function public.sb_apply_capacity_payment(p_id uuid,p_session text,p_amount integer,p_currency text) returns text language plpgsql security invoker set search_path='' as $$
declare r public.sb_capacity_changes;total integer;qty integer;event_status text;
begin
 select * into r from public.sb_capacity_changes where id=p_id;
 if not found then raise exception 'Upgrade not found';end if;
 select status into event_status from public.sb_events where id=r.event_id for update;
 select quantity_total into qty from public.sb_event_tiers where id=r.tier_id for update;
 select * into r from public.sb_capacity_changes where id=p_id for update;
 if r.stripe_session_id is distinct from p_session or r.amount_cents is distinct from p_amount or r.currency is distinct from p_currency or r.amount_cents<=0 then raise exception 'Upgrade payment mismatch';end if;
 if r.status in ('applied','needs_attention') then return r.status;end if;
 select sum(quantity_total)::integer into total from public.sb_event_tiers where event_id=r.event_id;
 if r.status<>'pending' or total<>r.old_total or qty<>r.old_quantity or event_status<>'published' then
  update public.sb_capacity_changes set status='needs_attention' where id=p_id;return 'needs_attention';
 end if;
 update public.sb_event_tiers set quantity_total=r.new_quantity where id=r.tier_id;
 update public.sb_capacity_changes set status='applied',applied_at=now() where id=p_id;
 return 'applied';
end $$;
create function public.sb_generate_capacity_alerts() returns integer language plpgsql security invoker set search_path='' as $$
declare e record;cap integer;used integer;v_threshold integer;new_id uuid;counter integer:=0;
begin
 for e in select ev.id,ev.title,o.owner_user_id from public.sb_events ev join public.sb_event_organisers o on o.id=ev.organiser_profile_id where ev.status='published' and not ev.internal_free_test and not ev.public_beta_test and coalesce(ev.ends_at,ev.starts_at+interval '12 hours')>now() loop
  select sum(t.quantity_total)::integer,sum(coalesce((select sum(quantity) from public.sb_event_orders where tier_id=t.id and (status in ('paid','needs_attention') or (status='reserved' and reserved_until>now()))),0)+public.sb_guest_reserved(t.id))::integer into cap,used from public.sb_event_tiers t where event_id=e.id;
  v_threshold:=case when used>=cap then 100 when used*100>=cap*95 then 95 when used*100>=cap*80 then 80 else 0 end;
  if v_threshold>0 and not exists(select 1 from public.sb_capacity_alerts where event_id=e.id and capacity=cap and sb_capacity_alerts.threshold>=v_threshold) then
   insert into public.sb_capacity_alerts(event_id,capacity,threshold,used) values(e.id,cap,v_threshold,used) on conflict do nothing returning id into new_id;
   if new_id is not null then
    insert into public.portal_notifications(user_id,title,body,target_url) values(e.owner_user_id,'Ticket capacity: '||v_threshold||'% allocated',e.title||': '||used||' of '||cap||' places sold or reserved, including guest allocations. Review capacity in your organiser portal.','https://theticketbunker.com/organiser?capacity='||e.id);
    counter:=counter+1;
   end if;
  end if;
 end loop;return counter;
end $$;
revoke all on function public.sb_capacity_quote(uuid,uuid,uuid,integer),public.sb_prepare_capacity_change(uuid,uuid,uuid,integer,integer),public.sb_apply_capacity_payment(uuid,text,integer,text),public.sb_generate_capacity_alerts() from public,anon,authenticated;
grant execute on function public.sb_capacity_quote(uuid,uuid,uuid,integer),public.sb_prepare_capacity_change(uuid,uuid,uuid,integer,integer),public.sb_apply_capacity_payment(uuid,text,integer,text),public.sb_generate_capacity_alerts() to service_role;
select cron.schedule('ticketbunker-capacity-alerts','*/5 * * * *','select public.sb_generate_capacity_alerts()');
create function public.sb_capacity_inventory(p_event uuid) returns table(tier_id uuid,used_count bigint) language sql stable security invoker set search_path='' as $$
 select t.id,coalesce((select sum(quantity) from public.sb_event_orders o where o.tier_id=t.id and (o.status in ('paid','needs_attention') or(o.status='reserved' and o.reserved_until>now()))),0)+public.sb_guest_reserved(t.id) from public.sb_event_tiers t where t.event_id=p_event
$$;
revoke all on function public.sb_capacity_inventory(uuid) from public,anon,authenticated;
grant execute on function public.sb_capacity_inventory(uuid) to service_role;
