-- Automatic premium email is only permitted after a verified paid placement.
-- A single stored broadcast ID makes Stripe retries safe. No emails are sent by
-- this migration; the app still requires separately enabled paid checkout.
ALTER TABLE public.sb_event_showcase_requests
 ADD COLUMN IF NOT EXISTS premium_email_status text NOT NULL DEFAULT 'pending',
 ADD COLUMN IF NOT EXISTS premium_email_claimed_at timestamptz,
 ADD COLUMN IF NOT EXISTS premium_email_sent_at timestamptz,
 ADD COLUMN IF NOT EXISTS premium_email_last_error text;
ALTER TABLE public.sb_event_showcase_requests
 DROP CONSTRAINT IF EXISTS sb_premium_email_status_check;
ALTER TABLE public.sb_event_showcase_requests
 ADD CONSTRAINT sb_premium_email_status_check
 CHECK (premium_email_status IN ('pending','preparing','ready','sending','sent','failed'));
ALTER TABLE public.sb_event_showcase_requests
 DROP CONSTRAINT IF EXISTS sb_premium_email_sent_guard;
ALTER TABLE public.sb_event_showcase_requests
 ADD CONSTRAINT sb_premium_email_sent_guard
 CHECK (premium_email_status <> 'sent' OR
       (premium_broadcast_id IS NOT NULL AND premium_email_sent_at IS NOT NULL
        AND paid_at IS NOT NULL AND stripe_session_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS sb_premium_email_pending_idx
 ON public.sb_event_showcase_requests(status,premium_email_status)
 WHERE premium_email_status <> 'sent';
