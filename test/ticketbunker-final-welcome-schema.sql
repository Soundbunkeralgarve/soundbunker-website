-- One welcome after all account checks. No early registration/Stripe-only mail.
create or replace function public.tb_queue_organiser_mail() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='approved' and new.stripe_capabilities_ready and new.tax_review_complete then
  if not exists(select 1 from tb_organiser_mail where organiser_id=new.id and status='accepted') then
   insert into tb_organiser_mail(organiser_id,kind) values(new.id,'ready') on conflict do nothing;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.tb_queue_organiser_mail() from public,anon,authenticated;
update public.tb_organiser_mail set status='failed',last_error='superseded_by_final_welcome',lease_token=null where kind in ('registered','verified') and status='pending';
insert into public.tb_organiser_mail(organiser_id,kind)
select o.id,'ready' from public.sb_event_organisers o
where o.status='approved' and o.stripe_capabilities_ready and o.tax_review_complete
and not exists(select 1 from public.tb_organiser_mail m where m.organiser_id=o.id and m.status='accepted')
on conflict do nothing;
