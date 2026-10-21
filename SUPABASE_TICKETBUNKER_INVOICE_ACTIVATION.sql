-- Queue only organiser service fees. Ticket-buyer proceeds and internal tests
-- are not SoundBunker sales. The company's own organiser cannot invoice itself.
create or replace function public.tb_queue_organiser_invoice(p_key text,p_event uuid,p_amount bigint,p_currency text,p_description text,p_paid boolean,p_session text,p_category text)
returns void language plpgsql set search_path='' as $$
declare org uuid;
begin
 if p_amount is null or p_amount<=0 then return;end if;
 select e.organiser_profile_id into org from public.sb_events e
 where e.id=p_event and not e.internal_free_test and not e.public_beta_test
 and not exists(select 1 from public.tb_organiser_billing b where b.organiser_profile_id=e.organiser_profile_id and regexp_replace(coalesce(b.vat_number,''),'[^0-9]','','g')='517757478');
 if org is null then return;end if;
 insert into public.tb_organiser_invoices(source_key,organiser_id,event_id,category,description,amount_cents,currency,paid,document_type,stripe_session_id)
 values(p_key,org,p_event,p_category,p_description,p_amount,p_currency,p_paid,case when p_paid then 'invoice_receipts' else 'invoices' end,p_session)
 on conflict(source_key) do nothing;
end $$;
revoke all on function public.tb_queue_organiser_invoice(text,uuid,bigint,text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.tb_queue_organiser_invoice(text,uuid,bigint,text,text,boolean,text,text) to service_role;
