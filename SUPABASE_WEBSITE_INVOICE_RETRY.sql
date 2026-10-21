-- Private server-side journal. No browser role can read customer invoices directly.
create table if not exists public.sb_website_invoice_jobs (
 id uuid primary key default gen_random_uuid(),
 brand text not null check(brand in('soundbunker','crude-city')),
 source_key text not null unique,document_reference text not null unique,
 stripe_session_id text not null unique,amount_cents bigint not null check(amount_cents>0),
 currency text not null check(currency='eur'),recipient jsonb not null,
 description text not null,observations text not null default '',
 document_type text not null default 'invoice_receipts',ix_document_id bigint unique,
 document_number text,document_url text,finalized_at timestamptz,
 request_payload jsonb,email_payload jsonb,email_sent_at timestamptz,
 lease_token uuid,lease_until timestamptz,attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),last_error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.sb_website_invoice_jobs drop constraint if exists sb_website_invoice_jobs_document_type_check;
alter table public.sb_website_invoice_jobs add constraint sb_website_invoice_jobs_document_type_check check(document_type in('invoices','invoice_receipts'));
alter table public.sb_website_invoice_jobs enable row level security;
revoke all on public.sb_website_invoice_jobs from anon,authenticated;
grant select,insert,update on public.sb_website_invoice_jobs to service_role;
create or replace function public.sb_claim_website_invoices(p_token uuid)
returns setof public.sb_website_invoice_jobs language plpgsql set search_path='' as $$
begin
 return query with due as (
  select id from public.sb_website_invoice_jobs
  where email_sent_at is null and next_attempt_at<=now() and (lease_until is null or lease_until<now())
  order by created_at limit 5 for update skip locked
 ) update public.sb_website_invoice_jobs j set lease_token=p_token,lease_until=now()+interval '5 minutes',attempts=attempts+1
 from due where j.id=due.id returning j.*;
end $$;
revoke all on function public.sb_claim_website_invoices(uuid) from public,anon,authenticated;
grant execute on function public.sb_claim_website_invoices(uuid) to service_role;
