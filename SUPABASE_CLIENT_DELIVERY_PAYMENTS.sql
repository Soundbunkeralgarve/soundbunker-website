-- Reuse the existing signed invoice payment lane for every client delivery.
-- No second Checkout, invoice or receipt is created for the same booking.
alter table public.sb_website_invoice_jobs add column if not exists delivery_verified_paid_cents bigint not null default 0 check(delivery_verified_paid_cents>=0);
-- Keep legacy uncertain creations on their original return URL. Every new
-- payment row uses the client area, including links opened from invoice emails.
alter table public.sb_invoice_balance_payments add column if not exists portal_return boolean not null default false;

-- A verified, finalized invoice can be delivered in the authenticated portal
-- even when the original invoice email is still awaiting retry.
create or replace function public.sb_lock_invoice_balance(p_id uuid,p_amount bigint,p_token uuid)
returns setof public.sb_invoice_balance_payments language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.sb_website_invoice_jobs j
  where j.id=p_id and j.brand='soundbunker' and j.document_type='invoices'
   and j.finalized_at is not null
   and (j.email_sent_at is not null or j.request_payload->>'portal_delivery'='true')
   and j.balance_paid_cents=0 and p_amount>0
   and p_amount<=j.amount_cents-greatest(coalesce((j.request_payload->>'paid_cents')::bigint,0),j.delivery_verified_paid_cents))
 then raise exception 'Invoice balance is unavailable';end if;
 insert into public.sb_invoice_balance_payments(invoice_id,amount_cents,portal_return) values(p_id,p_amount,true) on conflict(invoice_id) do nothing;
 return query update public.sb_invoice_balance_payments set lease_token=p_token,lease_until=now()+interval '2 minutes'
 where invoice_id=p_id and paid_at is null and (lease_until is null or lease_until<now()) returning *;
end $$;
revoke all on function public.sb_lock_invoice_balance(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.sb_lock_invoice_balance(uuid,bigint,uuid) to service_role;
