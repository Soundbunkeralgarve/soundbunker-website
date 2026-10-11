-- TicketBunker Premium Placement includes ONE opt-in SoundBunker subscriber
-- email draft per paid featured event. A request cannot trigger email sending.
ALTER TABLE public.sb_event_showcase_requests
 ADD COLUMN IF NOT EXISTS premium_broadcast_id text,
 ADD COLUMN IF NOT EXISTS premium_broadcast_drafted_at timestamptz,
 ADD COLUMN IF NOT EXISTS premium_mailout_reviewed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS sb_showcase_premium_broadcast_unique
 ON public.sb_event_showcase_requests(premium_broadcast_id) WHERE premium_broadcast_id IS NOT NULL;
ALTER TABLE public.sb_event_showcase_requests DROP CONSTRAINT IF EXISTS sb_premium_email_payment_guard;
ALTER TABLE public.sb_event_showcase_requests ADD CONSTRAINT sb_premium_email_payment_guard
 CHECK (premium_broadcast_id IS NULL OR
   (status IN ('paid','scheduled','live') AND paid_at IS NOT NULL
    AND stripe_session_id IS NOT NULL));
