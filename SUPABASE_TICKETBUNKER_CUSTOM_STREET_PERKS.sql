-- Add up to six custom reward milestones per Street Team promoter.
-- The existing promoter referral code, attribution and payout safeguards remain unchanged.
ALTER TABLE public.sb_event_street_team
 ADD COLUMN IF NOT EXISTS reward_rules jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.sb_event_street_team
 DROP CONSTRAINT IF EXISTS sb_street_team_rules_array;
ALTER TABLE public.sb_event_street_team
 ADD CONSTRAINT sb_street_team_rules_array CHECK (
  jsonb_typeof(reward_rules)='array' AND jsonb_array_length(reward_rules) BETWEEN 0 AND 6
 );
-- Compatible with earlier promoter records that held only one preset reward.
UPDATE public.sb_event_street_team SET reward_rules=jsonb_build_array(jsonb_build_object(
 'type',reward_type,
 'title',CASE reward_type WHEN 'vip_table' THEN 'VIP table' WHEN 'free_tickets' THEN 'Free tickets'
 WHEN 'cash_per_sale' THEN 'Cash per ticket' ELSE 'Custom perk' END,
 'target',reward_goal,'quantity',1,'cashCents',reward_value_cents,
 'details',reward_description
 )) WHERE reward_rules='[]'::jsonb;
-- Storage remains owner-only through existing service_role permissions and RLS.
