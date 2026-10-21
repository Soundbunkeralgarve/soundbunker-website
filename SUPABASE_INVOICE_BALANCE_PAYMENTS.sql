-- Server-only payment state. One active Stripe Checkout per invoice.
alter table public.sb_website_invoice_jobs add column if not exists balance_paid_cents bigint not null default 0 check(balance_paid_cents>=0);
alter table public.sb_website_invoice_jobs add column if not exists balance_receipt_url text;
create table if not exists public.sb_invoice_balance_payments (
 invoice_id uuid primary key references public.sb_website_invoice_jobs(id),
 amount_cents bigint not null check(amount_cents>0),
 generation integer not null default 1 check(generation>0),
 started_at timestamptz not null default now(),
 stripe_session_id text unique,stripe_url text,
 paid_at timestamptz,receipt_id bigint,receipt_url text,receipt_attempted_at timestamptz,
 email_sent_at timestamptz,lease_token uuid,lease_until timestamptz,
 last_error text,next_attempt_at timestamptz not null default now()
);
alter table public.sb_invoice_balance_payments enable row level security;
revoke all on public.sb_invoice_balance_payments from anon,authenticated;
grant select,insert,update on public.sb_invoice_balance_payments to service_role;

create or replace function public.sb_lock_invoice_balance(p_id uuid,p_amount bigint,p_token uuid)
returns setof public.sb_invoice_balance_payments language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.sb_website_invoice_jobs j where j.id=p_id and j.brand='soundbunker' and j.document_type='invoices' and j.email_sent_at is not null and j.balance_paid_cents=0 and p_amount>0 and p_amount<=j.amount_cents-coalesce((j.request_payload->>'paid_cents')::bigint,0)) then raise exception 'Invoice balance is unavailable';end if;
 insert into public.sb_invoice_balance_payments(invoice_id,amount_cents) values(p_id,p_amount) on conflict(invoice_id) do nothing;
 return query update public.sb_invoice_balance_payments set lease_token=p_token,lease_until=now()+interval '2 minutes'
 where invoice_id=p_id and paid_at is null and (lease_until is null or lease_until<now()) returning *;
end $$;

create or replace function public.sb_record_invoice_balance(p_id uuid,p_generation integer,p_session text,p_amount bigint)
returns boolean language plpgsql set search_path='' as $$
declare payment public.sb_invoice_balance_payments; j public.sb_website_invoice_jobs;
begin
 select * into payment from public.sb_invoice_balance_payments where invoice_id=p_id for update;
 if not found or payment.generation<>p_generation or payment.amount_cents<>p_amount or (payment.stripe_session_id is not null and payment.stripe_session_id<>p_session) then raise exception 'Invoice payment mismatch';end if;
 if payment.paid_at is not null then return true;end if;
 select * into j from public.sb_website_invoice_jobs where id=p_id for update;
 if j.brand<>'soundbunker' or j.document_type<>'invoices' or p_amount>j.amount_cents-coalesce((j.request_payload->>'paid_cents')::bigint,0) then raise exception 'Invoice payment amount mismatch';end if;
 update public.sb_invoice_balance_payments set stripe_session_id=p_session,paid_at=now(),lease_token=null,lease_until=null where invoice_id=p_id;
 update public.sb_website_invoice_jobs set balance_paid_cents=p_amount,updated_at=now() where id=p_id;
 return true;
end $$;

create or replace function public.sb_claim_invoice_balance_receipts(p_token uuid)
returns setof public.sb_invoice_balance_payments language plpgsql set search_path='' as $$
begin
 return query with due as (select invoice_id from public.sb_invoice_balance_payments where paid_at is not null and email_sent_at is null and next_attempt_at<=now() and (lease_until is null or lease_until<now()) order by paid_at limit 3 for update skip locked)
 update public.sb_invoice_balance_payments p set lease_token=p_token,lease_until=now()+interval '5 minutes' from due where p.invoice_id=due.invoice_id returning p.*;
end $$;
revoke all on function public.sb_lock_invoice_balance(uuid,bigint,uuid),public.sb_record_invoice_balance(uuid,integer,text,bigint),public.sb_claim_invoice_balance_receipts(uuid) from public,anon,authenticated;
grant execute on function public.sb_lock_invoice_balance(uuid,bigint,uuid),public.sb_record_invoice_balance(uuid,integer,text,bigint),public.sb_claim_invoice_balance_receipts(uuid) to service_role;
