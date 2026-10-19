-- Actual Stripe reconciliation only. Public clients never write money or readiness.
alter table public.sb_event_orders
 add column tb_checkout_key uuid unique,
 add column tb_payment_flow text check(tb_payment_flow is null or tb_payment_flow='separate_v1'),
 add column tb_recipient_account text,
 add column ticket_email_sent_at timestamptz;
alter table public.sb_event_orders drop constraint sb_event_orders_status_check;
alter table public.sb_event_orders add constraint sb_event_orders_status_check check(status in ('reserved','paid','cancelled','needs_attention','refunded'));
create table public.tb_ticket_payments(
 order_id uuid primary key references public.sb_event_orders(id),
 event_id uuid not null references public.sb_events(id),
 recipient_account text not null,
 stripe_payment_intent_id text not null unique,
 stripe_charge_id text not null unique,
 currency text not null check(currency in ('eur','gbp')),
 settlement_currency text not null,
 gross_cents bigint not null check(gross_cents>0),
 refunded_cents bigint not null default 0 check(refunded_cents>=0 and refunded_cents<=gross_cents),
 processing_fee_cents bigint check(processing_fee_cents>=0),
 available_on timestamptz,
 disputed boolean not null default false,
 refund_pending boolean not null default false,
 stripe_transfer_id text unique,
 transfer_cents bigint check(transfer_cents>=0),
 updated_at timestamptz not null default now()
);
create index tb_ticket_payments_event_idx on public.tb_ticket_payments(event_id);
alter table public.tb_ticket_payments enable row level security;
revoke all on public.tb_ticket_payments from public,anon,authenticated;
grant all on public.tb_ticket_payments to service_role;
create table public.tb_event_payment_terms(
 event_id uuid primary key references public.sb_events(id),
 model text not null check(model in ('fixed','usage')),
 included_tickets integer not null default 2000 check(included_tickets>=0),
 rate_cents integer not null default 0 check(rate_cents>=0),
 accepted_by uuid not null references auth.users(id),
 accepted_at timestamptz not null default now(),
 listing_fee_id uuid references public.sb_event_listing_fees(id),
 check(model<>'usage' or (included_tickets=2000 and rate_cents=15))
);
alter table public.tb_event_payment_terms enable row level security;
revoke all on public.tb_event_payment_terms from public,anon,authenticated;
grant all on public.tb_event_payment_terms to service_role;
alter table public.tb_event_settlements add column usage_fee_cents bigint check(usage_fee_cents>=0), add column release_token uuid, add column release_started_at timestamptz;
create table public.tb_stripe_events(
 stripe_event_id text primary key,
 event_type text not null,
 processed_at timestamptz not null default now()
);
alter table public.tb_stripe_events enable row level security;
revoke all on public.tb_stripe_events from public,anon,authenticated;
grant all on public.tb_stripe_events to service_role;
-- The advisory lock makes retries reserve one order for the same booking request.
create function public.tb_reserve_paid_ticket_checkout(p_request uuid,p_tier uuid,p_name text,p_email text,p_quantity integer)
returns public.sb_event_orders language plpgsql security invoker set search_path='' as $$
declare r public.sb_event_orders;
begin
 if current_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required';end if;
 if p_request is null then raise exception 'Missing booking request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,201));
 select * into r from public.sb_event_orders where tb_checkout_key=p_request;
 if found then
  if r.tier_id<>p_tier or r.customer_email<>p_email or r.customer_name<>p_name or r.quantity<>p_quantity or r.status<>'reserved' or r.reserved_until<=now() then raise exception 'Start a new booking request';end if;
  return r;
 end if;
 select * into r from public.sb_reserve_event_tickets(p_tier,p_name,p_email,p_quantity);
 update public.sb_event_orders set tb_checkout_key=p_request,tb_payment_flow='separate_v1' where id=r.id returning * into r;
 return r;
end;$$;
revoke all on function public.tb_reserve_paid_ticket_checkout(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.tb_reserve_paid_ticket_checkout(uuid,uuid,text,text,integer) to service_role;
-- Claim one event before any Stripe transfer. Refund review and release share this lock.
create function public.tb_claim_event_release(p_event uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare e public.sb_events;s public.tb_event_settlements;
begin
 if current_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event::text,202));
 select * into e from public.sb_events where id=p_event for update;
 if not found or e.status<>'published' or e.internal_free_test or e.public_beta_test or e.ends_at is null or e.ends_at+interval '12 hours'>now() or not exists(select 1 from public.tb_event_reports where event_id=p_event) then return false;end if;
 if exists(select 1 from public.tb_refund_requests where event_id=p_event and status in ('requested','reviewing','approved','processing')) then return false;end if;
 insert into public.tb_event_settlements(event_id)values(p_event)on conflict do nothing;
 select * into s from public.tb_event_settlements where event_id=p_event for update;
 if s.payout_status in ('processing','paid','blocked') or (s.release_started_at>now()-interval '5 minutes' and s.release_token<>p_token) then return false;end if;
 update public.tb_event_settlements set payout_status='reconciling',release_token=p_token,release_started_at=now() where event_id=p_event;
 return true;
end;$$;
revoke all on function public.tb_claim_event_release(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tb_claim_event_release(uuid,uuid) to service_role;
create function public.tb_claim_ticket_refund(p_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.tb_refund_requests;
begin
 if current_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required';end if;
 select * into r from public.tb_refund_requests where id=p_id;
 if not found then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(r.event_id::text,202));
 if exists(select 1 from public.tb_event_settlements where event_id=r.event_id and (release_token is not null or payout_status in ('processing','paid'))) or exists(select 1 from public.tb_ticket_payments where order_id=r.order_id and stripe_transfer_id is not null) then return false;end if;
 update public.tb_refund_requests set status='processing',updated_at=now() where id=p_id and status in ('approved','processing');
 return found;
end;$$;
revoke all on function public.tb_claim_ticket_refund(uuid) from public,anon,authenticated;
grant execute on function public.tb_claim_ticket_refund(uuid) to service_role;
-- Repeated/out-of-order webhooks never reduce a recorded refund or erase a transfer.
create function public.tb_record_ticket_payment(p jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.sb_event_orders;r public.tb_ticket_payments;
begin
 if current_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required';end if;
 select * into o from public.sb_event_orders where id=(p->>'order_id')::uuid for update;
 if not found or o.tb_payment_flow is distinct from 'separate_v1' or o.event_id<>(p->>'event_id')::uuid or o.total_cents<>(p->>'gross_cents')::bigint or o.currency<>p->>'currency' or o.tb_recipient_account is distinct from (p->>'recipient_account') then raise exception 'Payment mismatch';end if;
 insert into public.tb_ticket_payments(order_id,event_id,recipient_account,stripe_payment_intent_id,stripe_charge_id,currency,settlement_currency,gross_cents,refunded_cents,processing_fee_cents,available_on,disputed,refund_pending)
 values(o.id,o.event_id,o.tb_recipient_account,p->>'stripe_payment_intent_id',p->>'stripe_charge_id',o.currency,p->>'settlement_currency',o.total_cents,(p->>'refunded_cents')::bigint,(p->>'processing_fee_cents')::bigint,(p->>'available_on')::timestamptz,(p->>'disputed')::boolean,coalesce((p->>'refund_pending')::boolean,false))
 on conflict(order_id) do update set refunded_cents=greatest(public.tb_ticket_payments.refunded_cents,excluded.refunded_cents),processing_fee_cents=coalesce(excluded.processing_fee_cents,public.tb_ticket_payments.processing_fee_cents),available_on=coalesce(excluded.available_on,public.tb_ticket_payments.available_on),disputed=public.tb_ticket_payments.disputed or excluded.disputed,refund_pending=excluded.refund_pending,updated_at=now()
 where public.tb_ticket_payments.stripe_charge_id=excluded.stripe_charge_id and public.tb_ticket_payments.stripe_payment_intent_id=excluded.stripe_payment_intent_id
 returning * into r;
 if not found then raise exception 'Payment identity changed';end if;
 if r.refunded_cents=r.gross_cents then update public.sb_event_orders set status='refunded' where id=o.id and status in ('paid','needs_attention');end if;
 return to_jsonb(r);
end;$$;
revoke all on function public.tb_record_ticket_payment(jsonb) from public,anon,authenticated;
grant execute on function public.tb_record_ticket_payment(jsonb) to service_role;
create table public.tb_finance_audit(
 id uuid primary key default gen_random_uuid(), actor uuid not null references auth.users(id), organiser_id uuid references public.sb_event_organisers(id), action text not null, detail jsonb not null, created_at timestamptz not null default now()
);
alter table public.tb_finance_audit enable row level security;
revoke all on public.tb_finance_audit from public,anon,authenticated;
grant all on public.tb_finance_audit to service_role;
create function public.tb_review_organiser_tax(p_actor uuid,p_organiser uuid,p_confirm boolean,p_reason text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare u record;b public.tb_organiser_billing;
begin
 if current_user<>'postgres' and coalesce(auth.role(),'')<>'service_role' then raise exception 'Service access required';end if;
 select email,email_confirmed_at into u from auth.users where id=p_actor;
 if not found or u.email_confirmed_at is null or not exists(select 1 from public.tb_platform_admins where lower(email)=lower(u.email) and active) then raise exception 'Admin access required';end if;
 if p_confirm is null or length(trim(coalesce(p_reason,'')))<10 then raise exception 'Review note required';end if;
 select * into b from public.tb_organiser_billing where organiser_profile_id=p_organiser;
 if p_confirm and (not found or length(trim(coalesce(b.legal_name,'')))=0 or length(trim(coalesce(b.billing_email,'')))=0 or length(trim(coalesce(b.address_line_1,'')))=0 or length(trim(coalesce(b.city,'')))=0 or length(trim(coalesce(b.postal_code,'')))=0) then raise exception 'Billing details incomplete';end if;
 update public.sb_event_organisers set tax_review_complete=p_confirm,updated_at=now() where id=p_organiser;
 if not found then raise exception 'Organiser not found';end if;
 insert into public.tb_finance_audit(actor,organiser_id,action,detail) values(p_actor,p_organiser,'billing_tax_review',jsonb_build_object('confirmed',p_confirm,'reason',left(trim(p_reason),1000)));
 return true;
end;$$;
revoke all on function public.tb_review_organiser_tax(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.tb_review_organiser_tax(uuid,uuid,boolean,text) to service_role;
create function public.tb_due_event_settlements()
returns table(event_id uuid) language sql stable security invoker set search_path='' as $$
 select r.event_id from public.tb_event_reports r join public.sb_events e on e.id=r.event_id left join public.tb_event_settlements s on s.event_id=r.event_id
 where e.status='published' and not e.internal_free_test and not e.public_beta_test and r.due_at<=now() and coalesce(s.payout_status,'holding') in ('awaiting_activation','holding','reconciling','ready') and (s.release_started_at is null or s.release_started_at<now()-interval '5 minutes')
 order by r.due_at limit 1;
$$;
revoke all on function public.tb_due_event_settlements() from public,anon,authenticated;
grant execute on function public.tb_due_event_settlements() to service_role;
