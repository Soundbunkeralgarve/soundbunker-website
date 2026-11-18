-- Stripe verification now activates organiser accounts (api/lib/organiser-activation.js).
-- One-off backfill: organisers Stripe has already verified, with complete billing details,
-- go live now instead of waiting for a manual billing review. Each activation is audited.
with activated as (
 update public.sb_event_organisers o set tax_review_complete=true,updated_at=now()
 from public.tb_organiser_billing b
 where b.organiser_profile_id=o.id and o.status='approved' and o.stripe_capabilities_ready and not o.tax_review_complete
   and length(trim(coalesce(b.legal_name,'')))>0 and length(trim(coalesce(b.billing_email,'')))>0
   and length(trim(coalesce(b.address_line_1,'')))>0 and length(trim(coalesce(b.city,'')))>0
   and length(trim(coalesce(b.postal_code,'')))>0
 returning o.id,o.owner_user_id
)
insert into public.tb_finance_audit(actor,organiser_id,action,detail)
select owner_user_id,id,'billing_auto_activated',jsonb_build_object('source','stripe_verified_backfill') from activated;
