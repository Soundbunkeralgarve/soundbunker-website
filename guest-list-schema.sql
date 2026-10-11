-- Event-scoped complimentary allocations. Only server-side service_role can access.
create table public.sb_guest_allocations (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.sb_events(id),
 tier_id uuid not null references public.sb_event_tiers(id), artist_name text not null check(length(artist_name) between 2 and 100),
 artist_email text not null check(artist_email=lower(trim(artist_email)) and length(artist_email) between 5 and 254),
 quota integer not null check(quota between 1 and 2000), created_by uuid not null references auth.users(id),
 revoked_at timestamptz, created_at timestamptz not null default now(), invitation_sent_at timestamptz,
 unique(event_id,artist_email)
);
alter table public.sb_event_orders add column guest_allocation_id uuid references public.sb_guest_allocations(id);
create index sb_guest_orders_allocation on public.sb_event_orders(guest_allocation_id) where guest_allocation_id is not null;
create table public.sb_guest_entries (
 id uuid primary key default gen_random_uuid(), allocation_id uuid not null references public.sb_guest_allocations(id),
 request_id uuid not null, order_id uuid not null unique references public.sb_event_orders(id),
 guest_name text not null, guest_email text not null, email_sent_at timestamptz, created_at timestamptz not null default now(),
 unique(allocation_id,request_id), unique(allocation_id,guest_email,guest_name)
);
create index sb_guest_allocations_artist on public.sb_guest_allocations(artist_email);
create index sb_guest_allocations_tier on public.sb_guest_allocations(tier_id);
create index sb_guest_allocations_creator on public.sb_guest_allocations(created_by);
alter table public.sb_guest_allocations enable row level security;
alter table public.sb_guest_entries enable row level security;
revoke all on public.sb_guest_allocations,public.sb_guest_entries from public,anon,authenticated;
grant all on public.sb_guest_allocations,public.sb_guest_entries to service_role;

create function public.sb_guest_reserved(p_tier uuid) returns bigint language sql stable security invoker set search_path='' as $$
 select coalesce(sum(greatest(0,a.quota-(select count(*) from public.sb_event_orders o where o.guest_allocation_id=a.id and o.status in ('paid','needs_attention')))),0)::bigint
 from public.sb_guest_allocations a join public.sb_events e on e.id=a.event_id
 where a.tier_id=p_tier and a.revoked_at is null and e.status='published' and coalesce(e.ends_at,e.starts_at+interval '12 hours')>now()
$$;
revoke all on function public.sb_guest_reserved(uuid) from public,anon,authenticated;
grant execute on function public.sb_guest_reserved(uuid) to service_role;

create function public.sb_manage_guest_allocation(p_actor uuid,p_event uuid,p_tier uuid,p_name text,p_email text,p_quota integer,p_allocation uuid default null,p_revoke boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare ev record; t record; a record; used_count bigint; assigned bigint; previous bigint:=0; out_id uuid;
begin
 select e.* into ev from public.sb_events e where e.id=p_event for update;
 if not found or not exists(select 1 from public.sb_event_organisers o where o.id=ev.organiser_profile_id and o.owner_user_id=p_actor)
 then raise exception 'Only the event organiser can manage guest lists'; end if;
 if ev.status<>'published' or ev.internal_free_test or ev.public_beta_test or coalesce(ev.ends_at,ev.starts_at+interval '12 hours')<=now()
 then raise exception 'Guest lists require an active published event'; end if;
 select * into t from public.sb_event_tiers where id=p_tier and event_id=p_event for update;
 if not found then raise exception 'Ticket type not found'; end if;
 if p_allocation is not null then
  select * into a from public.sb_guest_allocations where id=p_allocation and event_id=p_event and tier_id=p_tier for update;
  if not found then raise exception 'Allocation not found'; end if;
  if p_revoke then update public.sb_guest_allocations set revoked_at=now() where id=a.id;return a.id;end if;
  if a.revoked_at is not null then raise exception 'Allocation has been revoked';end if;
  select count(*) into assigned from public.sb_event_orders where guest_allocation_id=a.id and status in ('paid','needs_attention');
  if p_quota<assigned then raise exception 'Limit cannot be below issued passes';end if;
  previous:=greatest(0,a.quota-assigned);
 else assigned:=0;end if;
 if p_quota is null or p_quota not between 1 and 2000 or length(trim(p_name)) not between 2 and 100 or p_email is null or length(trim(p_email)) not between 5 and 254 then raise exception 'Invalid allocation';end if;
 select coalesce(sum(quantity),0) into used_count from public.sb_event_orders where tier_id=p_tier and (status in ('paid','needs_attention') or (status='reserved' and reserved_until>now()));
 if used_count+public.sb_guest_reserved(p_tier)-previous+(p_quota-assigned)>t.quantity_total then raise exception 'Not enough capacity to reserve this guest allocation';end if;
 if p_allocation is null then
  insert into public.sb_guest_allocations(event_id,tier_id,artist_name,artist_email,quota,created_by)
  values(p_event,p_tier,trim(p_name),lower(trim(p_email)),p_quota,p_actor) returning id into out_id;
 else
  update public.sb_guest_allocations set quota=p_quota where id=a.id returning id into out_id;
 end if;
 return out_id;
end $$;
revoke all on function public.sb_manage_guest_allocation(uuid,uuid,uuid,text,text,integer,uuid,boolean) from public,anon,authenticated;
grant execute on function public.sb_manage_guest_allocation(uuid,uuid,uuid,text,text,integer,uuid,boolean) to service_role;

create function public.sb_issue_guest_pass(p_allocation uuid,p_actor uuid,p_email text,p_name text,p_guest_email text,p_request uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a record; ev record; t record; existing record; used_count bigint; ord uuid; entry_id uuid;
begin
 select * into a from public.sb_guest_allocations where id=p_allocation;
 if not found then raise exception 'Guest list unavailable';end if;
 -- Shared tier lock serializes paid reservations, allocation changes and free issuance.
 select * into t from public.sb_event_tiers where id=a.tier_id for update;
 select * into a from public.sb_guest_allocations where id=p_allocation for update;
 select * into ev from public.sb_events where id=a.event_id;
 if not exists(select 1 from auth.users u where u.id=p_actor and u.email_confirmed_at is not null and lower(u.email)=lower(p_email)) then raise exception 'Verified artist account required';end if;
 if lower(p_email)<>a.artist_email and not exists(select 1 from public.sb_event_organisers o where o.id=ev.organiser_profile_id and o.owner_user_id=p_actor) then raise exception 'Guest list access denied';end if;
 if a.revoked_at is not null or ev.status<>'published' or ev.internal_free_test or ev.public_beta_test or coalesce(ev.ends_at,ev.starts_at+interval '12 hours')<=now() then raise exception 'Guest list has closed';end if;
 if p_request is null or p_name is null or length(trim(p_name)) not between 2 and 100 or p_guest_email is null or length(trim(p_guest_email)) not between 5 and 254 then raise exception 'Enter a guest name and email';end if;
 select g.*,o.status into existing from public.sb_guest_entries g join public.sb_event_orders o on o.id=g.order_id
 where g.allocation_id=a.id and (g.request_id=p_request or (g.guest_email=lower(trim(p_guest_email)) and g.guest_name=trim(p_name))) limit 1;
 if found then
  if existing.guest_name<>trim(p_name) or existing.guest_email<>lower(trim(p_guest_email)) then raise exception 'Request already belongs to a different guest';end if;
  if existing.status<>'paid' then raise exception 'This guest pass was cancelled';end if;
  return existing.id;
 end if;
 select count(*) into used_count from public.sb_event_orders where guest_allocation_id=a.id and status in ('paid','needs_attention');
 if used_count>=a.quota then raise exception 'Guest-list allocation is full';end if;
 select coalesce(sum(quantity),0) into used_count from public.sb_event_orders where tier_id=a.tier_id and (status in ('paid','needs_attention') or (status='reserved' and reserved_until>now()));
 if used_count>=t.quantity_total then raise exception 'Event capacity reached';end if;
 insert into public.sb_event_orders(event_id,tier_id,customer_name,customer_email,quantity,total_cents,status,reserved_until,currency,paid_at,guest_allocation_id)
 values(a.event_id,a.tier_id,trim(p_name),lower(trim(p_guest_email)),1,0,'paid',now(),ev.currency,now(),a.id) returning id into ord;
 insert into public.sb_event_tickets(order_id,event_id,tier_id,sequence_number,holder_name,holder_email)
 values(ord,a.event_id,a.tier_id,1,trim(p_name),lower(trim(p_guest_email)));
 insert into public.sb_guest_entries(allocation_id,request_id,order_id,guest_name,guest_email)
 values(a.id,p_request,ord,trim(p_name),lower(trim(p_guest_email))) returning id into entry_id;
 return entry_id;
end $$;
revoke all on function public.sb_issue_guest_pass(uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.sb_issue_guest_pass(uuid,uuid,text,text,text,uuid) to service_role;
