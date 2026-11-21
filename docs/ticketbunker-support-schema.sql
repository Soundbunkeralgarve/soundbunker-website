-- Additive customer support workflow. No payment, refund, transfer or payout is executed.
-- Service APIs verify a current user; all privileged RPCs below are service-role only.
create table public.tb_support_cases (
 id uuid primary key default gen_random_uuid(),
 reference text not null unique default ('TB-' || upper(replace(gen_random_uuid()::text,'-',''))),
 owner_id uuid not null references auth.users(id),
 customer_email text not null,
 category text not null check(category in('tickets','payment','refund','accessibility','organiser','general','complaint')),
 subject text not null check(length(subject) between 5 and 160),
 status text not null default 'open' check(status in('open','waiting_customer','waiting_supplier','resolved')),
 priority text not null default 'normal' check(priority in('normal','urgent')),
 order_id uuid references public.sb_event_orders(id),
 event_id uuid references public.sb_events(id),
 event_name text not null default '' check(length(event_name)<=180),
 supplier_reference text not null default '' check(length(supplier_reference)<=180),
 refund_request_id uuid references public.tb_refund_requests(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 last_message_at timestamptz not null default now(),
 resolved_at timestamptz
);
create index tb_support_owner_activity on public.tb_support_cases(owner_id,updated_at desc);
create index tb_support_queue on public.tb_support_cases(status,priority,updated_at);
create table public.tb_support_messages (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.tb_support_cases(id),
 author_id uuid not null references auth.users(id),
 author_type text not null check(author_type in('customer','support')),
 kind text not null default 'message' check(kind in('message','status')),
 internal boolean not null default false,
 body text not null check(length(body) between 1 and 4000),
 created_at timestamptz not null default now(),
 check(not internal or author_type='support')
);
create index tb_support_message_history on public.tb_support_messages(case_id,created_at desc,id);
create table public.tb_support_events (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.tb_support_cases(id),
 actor_id uuid not null references auth.users(id),
 type text not null check(type in('created','customer_reply','support_reply','internal_note','status_changed','refund_linked')),
 status text,
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index tb_support_event_history on public.tb_support_events(case_id,created_at desc,id);
create table public.tb_support_actions (
 actor_id uuid not null references auth.users(id),
 client_request_id uuid not null,
 action text not null,
 request_data jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(actor_id,client_request_id)
);
create index tb_support_actor_rate on public.tb_support_actions(actor_id,action,created_at);
create table public.tb_support_outbox (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.tb_support_cases(id),
 message_id uuid references public.tb_support_messages(id),
 recipient_kind text not null check(recipient_kind in('customer','support')),
 recipient_email text not null,
 subject text not null,
 body text not null,
 state text not null default 'ready' check(state in('ready','sending','sent','review')),
 attempts integer not null default 0,
 first_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 provider_id text,
 sent_at timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 unique(message_id,recipient_kind),
 check(state<>'sent' or (provider_id is not null and sent_at is not null))
);
create index tb_support_outbox_due on public.tb_support_outbox(next_attempt_at) where state in('ready','sending');
create index tb_support_outbox_case on public.tb_support_outbox(case_id,state);

alter table public.tb_support_cases enable row level security;
alter table public.tb_support_messages enable row level security;
alter table public.tb_support_events enable row level security;
alter table public.tb_support_actions enable row level security;
alter table public.tb_support_outbox enable row level security;
revoke all on public.tb_support_cases,public.tb_support_messages,public.tb_support_events,public.tb_support_actions,public.tb_support_outbox from public,anon,authenticated;
grant all on public.tb_support_cases,public.tb_support_messages,public.tb_support_events,public.tb_support_actions,public.tb_support_outbox to service_role;

-- The verified actor email comes only from the server's auth.getUser result.
-- service_role has no SELECT on auth.users; do not broaden auth-table grants.
create function public.tb_support_write(p_actor uuid,p_actor_email text,p_client_request uuid,p_action text,p_data jsonb,p_owner_email text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 actor_email text; owner_email text; is_admin boolean; prior public.tb_support_actions;
 c public.tb_support_cases; o public.sb_event_orders; e public.sb_events;
 message_id uuid; refund_id uuid; ticket_order uuid; result jsonb; text_body text; note text;
 category text; subject text; is_internal boolean; next_status text; next_priority text;
begin
 actor_email=lower(btrim(p_actor_email));
 if p_actor is null or actor_email is null or actor_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'SUPPORT_AUTH: A verified account is required'; end if;
 if p_client_request is null or p_action not in('create','reply','update') or jsonb_typeof(p_data)<>'object' then raise exception 'SUPPORT_INPUT: Invalid support request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,81440));
 select * into prior from public.tb_support_actions where actor_id=p_actor and client_request_id=p_client_request;
 if found then
  if prior.action<>p_action or prior.request_data<>p_data then raise exception 'SUPPORT_CONFLICT: This request reference was already used for different content';end if;
  return prior.result;
 end if;
 select exists(select 1 from public.tb_platform_admins where email=actor_email and active=true) into is_admin;
 if (select count(*) from public.tb_support_actions where actor_id=p_actor and created_at>now()-interval '1 hour')>=60 then raise exception 'SUPPORT_RATE: Message limit reached; please try again later or email support';end if;
 if p_action='create' then
  if (select count(*) from public.tb_support_actions where actor_id=p_actor and action='create' and created_at>now()-interval '1 hour')>=5
   or (select count(*) from public.tb_support_actions where actor_id=p_actor and action='create' and created_at>now()-interval '1 day')>=20
   then raise exception 'SUPPORT_RATE: Case limit reached; reply to your existing case or email support';end if;
  category=btrim(coalesce(p_data->>'category',''));subject=btrim(coalesce(p_data->>'subject',''));text_body=btrim(coalesce(p_data->>'body',''));
  if category not in('tickets','payment','refund','accessibility','organiser','general','complaint') or length(subject) not between 5 and 160 or length(text_body) not between 10 and 4000
   or length(coalesce(p_data->>'eventName',''))>180 or length(coalesce(p_data->>'supplierReference',''))>180 then raise exception 'SUPPORT_INPUT: Check the category, subject and message';end if;
  if nullif(p_data->>'ticketId','') is not null then
   select order_id into ticket_order from public.sb_event_tickets where id=(p_data->>'ticketId')::uuid;
   if ticket_order is null or (nullif(p_data->>'orderId','') is not null and (p_data->>'orderId')::uuid<>ticket_order) then raise exception 'SUPPORT_ORDER: This booking could not be verified for your account';end if;
  end if;
  if nullif(p_data->>'orderId','') is not null or ticket_order is not null then
   select * into o from public.sb_event_orders where id=coalesce(ticket_order,(p_data->>'orderId')::uuid) and lower(customer_email)=actor_email;
   if not found then raise exception 'SUPPORT_ORDER: This booking could not be verified for your account';end if;
   select * into e from public.sb_events where id=o.event_id;
   if category='refund' and o.status='paid' and not coalesce(o.beta_test_order,false) and o.total_cents>0 then
    -- Share the financial release lock. Creating a review must be serialised
    -- with claiming a payout; actual Stripe refunds retain existing guards.
    perform pg_advisory_xact_lock(hashtextextended(o.event_id::text,202));
    insert into public.tb_refund_requests(order_id,event_id,requested_by,reason)values(o.id,o.event_id,p_actor,left(text_body,1200))
     on conflict(order_id,requested_by) do nothing returning id into refund_id;
    if refund_id is null then select id into refund_id from public.tb_refund_requests where order_id=o.id and requested_by=p_actor;end if;
   elsif category='refund' then
    select id into refund_id from public.tb_refund_requests where order_id=o.id and requested_by=p_actor;
   end if;
  end if;
  insert into public.tb_support_cases(owner_id,customer_email,category,subject,order_id,event_id,event_name,supplier_reference,refund_request_id,priority)
   values(p_actor,actor_email,category,subject,o.id,o.event_id,coalesce(e.title,btrim(coalesce(p_data->>'eventName',''))),btrim(coalesce(p_data->>'supplierReference','')),refund_id,
    case when e.starts_at between now()-interval '4 hours' and now()+interval '24 hours' and category in('tickets','payment','complaint','accessibility') then 'urgent' else 'normal' end)
   returning * into c;
  insert into public.tb_support_messages(case_id,author_id,author_type,body)values(c.id,p_actor,'customer',text_body) returning id into message_id;
  insert into public.tb_support_events(case_id,actor_id,type,status)values(c.id,p_actor,'created','open');
  if refund_id is not null then insert into public.tb_support_events(case_id,actor_id,type,details)values(c.id,p_actor,'refund_linked',jsonb_build_object('refundRequestId',refund_id));end if;
  insert into public.tb_support_outbox(case_id,message_id,recipient_kind,recipient_email,subject,body)values
   (c.id,message_id,'customer',actor_email,'We have your enquiry · '||c.reference,
    'Your enquiry has been saved.'||chr(10)||chr(10)||'Reference: '||c.reference||chr(10)||'Subject: '||c.subject||chr(10)||chr(10)||
    case when category='refund' then 'A refund enquiry is a request for review, not approval or payment. Your case will show any linked refund status.'||chr(10)||chr(10) else '' end||
    'View your case and add information securely:'||chr(10)||'https://theticketbunker.com/support?case='||c.id::text||chr(10)||chr(10)||
    'Please add replies in your secure case to keep the conversation together. If you cannot sign in, email bookings@theticketbunker.com and quote your reference. Never send passwords or full card details.'),
   (c.id,message_id,'support','bookings@theticketbunker.com','New support case · '||c.reference,
    'A customer has opened a support case.'||chr(10)||chr(10)||'Reference: '||c.reference||chr(10)||'Customer: '||actor_email||chr(10)||'Category: '||category||chr(10)||'Priority: '||c.priority||chr(10)||'Subject: '||c.subject||chr(10)||chr(10)||text_body||chr(10)||chr(10)||'Open the owner support queue:'||chr(10)||'https://theticketbunker.com/support-admin?case='||c.id::text);
 elsif p_action in('reply','update') then
  select * into c from public.tb_support_cases where id=(p_data->>'caseId')::uuid for update;
  if not found or (not is_admin and c.owner_id<>p_actor) then raise exception 'SUPPORT_NOT_FOUND: Case not found for this account';end if;
  owner_email=lower(nullif(btrim(p_owner_email),''));
  if owner_email is not null then c.customer_email=owner_email;end if;
  if p_action='reply' then
   text_body=btrim(coalesce(p_data->>'body',''));is_internal=coalesce((p_data->>'internal')::boolean,false);
   if length(text_body) not between 1 and 4000 then raise exception 'SUPPORT_INPUT: Write a message of 1–4,000 characters';end if;
   if is_internal and not is_admin then raise exception 'SUPPORT_FORBIDDEN: Internal notes require owner support access';end if;
   if not is_admin and (select count(*) from public.tb_support_messages where author_id=p_actor and created_at>now()-interval '1 hour')>=30 then raise exception 'SUPPORT_RATE: Message limit reached; please try again later';end if;
   insert into public.tb_support_messages(case_id,author_id,author_type,internal,body)values(c.id,p_actor,case when is_admin then 'support' else 'customer' end,is_internal,text_body) returning id into message_id;
   if not is_internal then c.status=case when is_admin then 'waiting_customer' else 'open' end;end if;
   update public.tb_support_cases set status=c.status,customer_email=c.customer_email,updated_at=now(),last_message_at=case when is_internal then last_message_at else now() end,resolved_at=case when c.status='resolved' then resolved_at else null end where id=c.id;
   insert into public.tb_support_events(case_id,actor_id,type,status)values(c.id,p_actor,case when is_internal then 'internal_note' when is_admin then 'support_reply' else 'customer_reply' end,c.status);
   if not is_internal then
    insert into public.tb_support_outbox(case_id,message_id,recipient_kind,recipient_email,subject,body)values(c.id,message_id,
     case when is_admin then 'customer' else 'support' end,case when is_admin then c.customer_email else 'bookings@theticketbunker.com' end,
     case when is_admin then 'Your support case has a reply · ' else 'Customer reply · ' end||c.reference,
     'Reference: '||c.reference||chr(10)||'Subject: '||c.subject||chr(10)||chr(10)||text_body||chr(10)||chr(10)||
     'View the conversation and reply securely:'||chr(10)||case when is_admin then 'https://theticketbunker.com/support?case=' else 'https://theticketbunker.com/support-admin?case=' end||c.id::text||chr(10)||chr(10)||'Please add replies in the secure case. If you cannot sign in, email bookings@theticketbunker.com and quote your reference. Never send passwords or full card details.');
   end if;
  else
   if not is_admin then raise exception 'SUPPORT_FORBIDDEN: Owner support access required';end if;
   next_status=coalesce(p_data->>'status',c.status);next_priority=coalesce(p_data->>'priority',c.priority);note=btrim(coalesce(p_data->>'note',''));
   if next_status not in('open','waiting_customer','waiting_supplier','resolved') or next_priority not in('normal','urgent') or length(note) not between 3 and 1000 then raise exception 'SUPPORT_INPUT: Choose a status and priority and record a reason';end if;
   if next_status='resolved' and c.status<>'resolved' and not exists(
    select 1 from public.tb_support_messages m where m.case_id=c.id and m.author_type='support' and not m.internal and m.kind='message'
     and m.created_at>=coalesce((select max(created_at) from public.tb_support_messages where case_id=c.id and author_type='customer'),c.created_at)
   ) then raise exception 'SUPPORT_INPUT: Send the customer a public decision or resolution reply before resolving this case';end if;
   update public.tb_support_cases set status=next_status,priority=next_priority,customer_email=c.customer_email,updated_at=now(),resolved_at=case when next_status='resolved' then coalesce(resolved_at,now()) else null end where id=c.id;
   insert into public.tb_support_events(case_id,actor_id,type,status,details)values(c.id,p_actor,'status_changed',next_status,jsonb_build_object('previousStatus',c.status,'priority',next_priority,'note',note));
   if next_status<>c.status then
    text_body='Case status updated: '||case next_status when 'open' then 'Open' when 'waiting_customer' then 'Waiting for your reply' when 'waiting_supplier' then 'Waiting for the supplier' else 'Resolved' end||'.'||chr(10)||chr(10)||
     'A case status change does not confirm refund approval or payment. Any linked refund status is shown separately. If you still need help, add a reply in your case.';
    insert into public.tb_support_messages(case_id,author_id,author_type,kind,body)values(c.id,p_actor,'support','status',text_body) returning id into message_id;
    update public.tb_support_cases set last_message_at=now() where id=c.id;
    insert into public.tb_support_outbox(case_id,message_id,recipient_kind,recipient_email,subject,body)values(c.id,message_id,'customer',c.customer_email,
     'Support case status updated · '||c.reference,'Reference: '||c.reference||chr(10)||'Subject: '||c.subject||chr(10)||chr(10)||text_body||chr(10)||chr(10)||'https://theticketbunker.com/support?case='||c.id::text);
   end if;
  end if;
 end if;
 result=jsonb_build_object('caseId',c.id,'messageId',message_id,'refundRequestId',coalesce(refund_id,c.refund_request_id));
 insert into public.tb_support_actions(actor_id,client_request_id,action,request_data,result)values(p_actor,p_client_request,p_action,p_data,result);
 return result;
end $$;

create function public.tb_support_claim_notifications(p_token uuid,p_case uuid default null,p_limit integer default 10)
returns setof public.tb_support_outbox language sql security invoker set search_path='' as $$
 update public.tb_support_outbox o set state='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_token=p_token,lease_until=now()+interval '2 minutes'
 where o.id in(select id from public.tb_support_outbox where state in('ready','sending') and next_attempt_at<=now() and (lease_until is null or lease_until<now()) and (p_case is null or case_id=p_case)
  order by next_attempt_at,id limit least(greatest(p_limit,1),20) for update skip locked)
 returning o.*;
$$;
revoke all on function public.tb_support_write(uuid,text,uuid,text,jsonb,text),public.tb_support_claim_notifications(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.tb_support_write(uuid,text,uuid,text,jsonb,text),public.tb_support_claim_notifications(uuid,uuid,integer) to service_role;
