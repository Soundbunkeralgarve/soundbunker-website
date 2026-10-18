-- VAT-inclusive fixed capacity bands. Over 2,000 requires a separately agreed setup-plus-sales plan.
create or replace function public.sb_capacity_quote(p_actor uuid,p_event uuid,p_tier uuid,p_quantity integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e record;t record;total integer;band integer;target integer;prices integer[];
 names text[]:=array['starter','standard','headline','event_plus'];caps integer[]:=array[100,500,1000,2000];
 credit bigint:=0;upgrade_credit bigint:=0;charity boolean:=false;
begin
 select * into e from public.sb_events where id=p_event;
 if not found or not exists(select 1 from public.sb_event_organisers where id=e.organiser_profile_id and owner_user_id=p_actor) then raise exception 'Event access denied';end if;
 if e.status<>'published' or e.internal_free_test or e.public_beta_test or coalesce(e.ends_at,e.starts_at+interval '12 hours')<=now() then raise exception 'Capacity changes require an active published event';end if;
 select * into t from public.sb_event_tiers where id=p_tier and event_id=p_event;
 if not found or p_quantity is null or p_quantity<=t.quantity_total then raise exception 'Enter a larger ticket quantity';end if;
 select sum(quantity_total)::integer into total from public.sb_event_tiers where event_id=p_event;
 if total-t.quantity_total+p_quantity>2000 then raise exception 'Above 2,000 tickets, agree a setup-plus-sales plan before activation';end if;
 prices:=array[9900,19900,29900,39900];
 if e.currency not in ('eur','gbp') then raise exception 'Unsupported event currency';end if;
 select max(array_position(names,tier_code)),coalesce(sum(amount_cents),0) into band,credit from public.sb_event_listing_fees where event_id=p_event and status='paid' and currency=e.currency;
 select greatest(band,max(array_position(names,target_band))),coalesce(sum(amount_cents),0) into band,upgrade_credit from public.sb_capacity_changes where event_id=p_event and status='applied' and currency=e.currency;
 charity:=exists(select 1 from public.sb_event_charity_claims where event_id=p_event and status='verified');
 if charity then band:=greatest(band,4);credit:=greatest(credit,prices[4]);end if;
 credit:=credit+upgrade_credit;
 if band is null then raise exception 'A paid listing or verified charity exemption is required';end if;
 select min(i) into target from generate_subscripts(caps,1) i where caps[i]>=total-t.quantity_total+p_quantity;
 target:=greatest(band,target);
 return jsonb_build_object('oldTotal',total,'newTotal',total-t.quantity_total+p_quantity,'oldQuantity',t.quantity_total,'newQuantity',p_quantity,'currentBand',names[band],'targetBand',names[target],'paidCreditCents',credit,'targetAmountCents',prices[target],'amountCents',case when target=band then 0 else greatest(0,prices[target]-credit) end,'currency',e.currency,'vatIncluded',true);
end;$$;
revoke all on function public.sb_capacity_quote(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.sb_capacity_quote(uuid,uuid,uuid,integer) to service_role;
