-- Owner billing review records an explicit invoice treatment. UK business
-- status is evidenced separately from whether a VAT number is present.
create or replace function public.tb_review_organiser_invoice_tax(p_actor uuid,p_organiser uuid,p_confirm boolean,p_reason text,p_treatment text,p_business_confirmed boolean)
returns boolean language plpgsql set search_path='' as $$
declare b public.tb_organiser_billing;taxname text;taxpercent numeric;exemption text;reviewnote text;
begin
 if p_confirm is null or length(trim(coalesce(p_reason,'')))<10 then raise exception 'Review evidence is required';end if;
 if p_confirm then
  select * into b from public.tb_organiser_billing where organiser_profile_id=p_organiser;
  if not found then raise exception 'Complete organiser billing details first';end if;
  if p_treatment='pt_standard' and b.country_code='PT' and b.postal_code~'^[1-8][0-9]{3}-[0-9]{3}$' then
   taxpercent:=23;exemption:=null;
   select t->>'name' into taxname from public.tb_invoice_brands v cross join lateral jsonb_array_elements(v.taxes) t where v.brand='ticketbunker' and v.checked_at is not null and t->>'name'='IVA23' and (t->>'value')::numeric=23 limit 1;
  elsif p_treatment='uk_business_reverse_charge' and b.country_code='GB' and p_business_confirmed is true then
   taxpercent:=0;exemption:='M40';
   select t->>'name' into taxname from public.tb_invoice_brands v cross join lateral jsonb_array_elements(v.taxes) t where v.brand='ticketbunker' and v.checked_at is not null and (t->>'value')::numeric=0 order by (t->>'name'='Isento') desc,t->>'name' limit 1;
  else raise exception 'This organiser VAT treatment requires further review';end if;
  if taxname is null then raise exception 'Verify InvoiceXpress tax configuration first';end if;
 end if;
 reviewnote:='Invoice treatment: '||coalesce(p_treatment,'review_required')||'; UK business evidence confirmed: '||coalesce(p_business_confirmed,false)::text||'. '||trim(p_reason);
 -- This existing function validates the actual confirmed platform-admin actor,
 -- complete billing data and server access, and writes the review audit trail.
 perform public.tb_review_organiser_tax(p_actor,p_organiser,p_confirm,reviewnote);
 if p_confirm then
  insert into public.tb_invoice_tax_rules(organiser_id,category,tax_name,percent,exemption_code,approved_by,approved_at)
  select p_organiser,category,taxname,taxpercent,exemption,p_actor,now() from unnest(array['service','processing']) category
  on conflict(organiser_id,category) do update set tax_name=excluded.tax_name,percent=excluded.percent,exemption_code=excluded.exemption_code,approved_by=excluded.approved_by,approved_at=excluded.approved_at;
 end if;
 return true;
end $$;
revoke all on function public.tb_review_organiser_invoice_tax(uuid,uuid,boolean,text,text,boolean) from public,anon,authenticated;
grant execute on function public.tb_review_organiser_invoice_tax(uuid,uuid,boolean,text,text,boolean) to service_role;
