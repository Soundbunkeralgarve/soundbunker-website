begin;

-- Lock the code while reconciling historical redemptions and setting the lifetime cap.
select code from public.plugin_codes where code = 'SBPRODUCER' for update;

-- Apply the private, verified legacy Stripe backfill here on the existing production database.
-- VERIFIED_LEGACY_REDEMPTIONS

update public.plugin_codes c set
  max_uses = 30,
  uses = greatest(c.uses, (select count(*)::integer from public.plugin_code_redemptions where code = c.code))
where c.code = 'SBPRODUCER';

create or replace function public.sb_plugin_producer_eligible(p_email text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.plugin_code_redemptions r
    join public.plugin_licences l on l.id = r.licence_id
    where r.code = 'SBPRODUCER' and r.email = lower(btrim(p_email)) and l.product_id = 'complete'
  );
$$;

create or replace function public.sb_plugin_require_producer_redemption()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not public.sb_plugin_producer_eligible(new.email) then
    raise exception using errcode = '42501', message = 'An SBPRODUCER redemption is required to join the affiliate programme';
  end if;
  return new;
end $$;

drop trigger if exists plugin_affiliate_requires_producer_redemption on public.plugin_affiliates;
create trigger plugin_affiliate_requires_producer_redemption before insert or update of email on public.plugin_affiliates
for each row execute function public.sb_plugin_require_producer_redemption();

create or replace function public.sb_plugin_claim_giveaway(p_user_id uuid, p_email text, p_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  promo public.plugin_codes;
  existing public.plugin_licences;
  result jsonb;
  address text := lower(btrim(p_email));
begin
  select * into promo from public.plugin_codes where code = 'SBPRODUCER' for update;
  if not found or not promo.active or promo.product_id <> 'complete' then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select l.* into existing from public.plugin_code_redemptions r
    join public.plugin_licences l on l.id = r.licence_id
    where r.code = promo.code and r.email = address and l.product_id = promo.product_id;
  if found then
    if existing.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'inactive'); end if;
    update public.plugin_licences set user_id = p_user_id where id = existing.id and user_id is null;
    return jsonb_build_object('ok', true, 'id', existing.id, 'new', false);
  end if;

  if not exists (select 1 from public.plugin_products where id = promo.product_id and active) then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  result := public.sb_plugin_redeem_code(promo.code, address, p_key);
  if (result->>'ok')::boolean then
    update public.plugin_licences set user_id = p_user_id, amount_cents = 0 where id = (result->>'id')::uuid;
  end if;
  return result;
end $$;

create or replace function public.sb_plugin_affiliate_record(p_payment text, p_session text, p_affiliate uuid, p_email text, p_buyer uuid)
returns void language sql security invoker set search_path = '' as $$
  insert into public.plugin_affiliate_sales (payment_intent, stripe_session_id, affiliate_id)
  select p_payment, p_session, a.user_id from public.plugin_affiliates a
  where a.user_id = p_affiliate and public.sb_plugin_producer_eligible(a.email)
    and lower(a.email) <> lower(btrim(p_email)) and a.user_id is distinct from p_buyer
  on conflict (payment_intent) do update set stripe_session_id = excluded.stripe_session_id
    where plugin_affiliate_sales.stripe_session_id is null;
$$;

revoke all on function public.sb_plugin_producer_eligible(text), public.sb_plugin_require_producer_redemption()
  from public, anon, authenticated;
grant execute on function public.sb_plugin_producer_eligible(text), public.sb_plugin_require_producer_redemption()
  to service_role;

commit;
