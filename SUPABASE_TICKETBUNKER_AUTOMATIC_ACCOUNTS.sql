-- The legacy 'approved' value now means active; account registration needs no manual review.
-- Preserve suspended accounts and all separate Stripe, tax and event-publication checks.
alter table public.sb_event_organisers alter column status set default 'approved';
update public.sb_event_organisers set status='approved',updated_at=now() where status='pending_review';
alter table public.sb_event_organisers drop constraint sb_event_organisers_status_check;
alter table public.sb_event_organisers add constraint sb_event_organisers_status_check check(status in ('approved','suspended'));
create or replace function public.tb_update_client(p_actor uuid,p_id uuid,p_name text,p_status text,p_discount integer,p_until timestamptz,p_reason text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_org public.sb_event_organisers;old_control public.tb_client_controls;u record;
begin
 if coalesce(auth.role(),'')<>'service_role' and current_user<>'postgres' then raise exception 'Service access required';end if;
 select email into u from auth.users where id=p_actor and email_confirmed_at is not null;
 if not found or not exists(select 1 from public.tb_platform_admins where email=lower(u.email) and active) then raise exception 'Owner access required';end if;
 if length(trim(coalesce(p_name,''))) not between 2 and 160 or p_status is null or p_status not in ('approved','suspended') or p_discount is null or p_discount not between 0 and 100 or length(trim(coalesce(p_reason,''))) not between 3 and 1000 or (p_until is not null and p_until<=now()) then raise exception 'Check client details, expiry and reason';end if;
 select * into old_org from public.sb_event_organisers where id=p_id for update;
 if not found then raise exception 'Organiser not found';end if;
 select * into old_control from public.tb_client_controls where organiser_id=p_id;
 update public.sb_event_organisers set display_name=trim(p_name),status=p_status,updated_at=now() where id=p_id;
 insert into public.tb_client_controls(organiser_id,listing_discount_percent,valid_until,reason,updated_by) values(p_id,p_discount,p_until,trim(p_reason),p_actor)
 on conflict(organiser_id) do update set listing_discount_percent=excluded.listing_discount_percent,valid_until=excluded.valid_until,reason=excluded.reason,updated_by=p_actor,updated_at=now();
 insert into public.tb_admin_audit(actor,action,target,details) values(p_actor,'update_client',p_id,jsonb_build_object('before',jsonb_build_object('display_name',old_org.display_name,'status',old_org.status,'listing_discount_percent',coalesce(old_control.listing_discount_percent,0)),'after',jsonb_build_object('display_name',trim(p_name),'status',p_status,'listing_discount_percent',p_discount,'valid_until',p_until),'reason',trim(p_reason)));
 return jsonb_build_object('saved',true);
end;$$;
revoke all on function public.tb_update_client(uuid,uuid,text,text,integer,timestamptz,text) from public,anon,authenticated;
grant execute on function public.tb_update_client(uuid,uuid,text,text,integer,timestamptz,text) to service_role;
